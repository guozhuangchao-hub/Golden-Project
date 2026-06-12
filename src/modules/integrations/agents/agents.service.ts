import { Injectable } from '@nestjs/common';
import { AgentInboundEventStatus, Prisma } from '@prisma/client';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { AppConfigService } from '../../../platform/config/app-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatAgentDto } from './dto/chat-agent.dto';
import { ManagerWorkflowDto } from './dto/manager-workflow.dto';
import { MemberWorkflowDto } from './dto/member-workflow.dto';
import { UpsertAgentIntegrationDto } from './dto/upsert-agent-integration.dto';

type AgentWebhookPayload = Record<string, unknown>;
type AgentConfig = {
  mode?: 'openclaw-cli' | 'builtin';
  command?: string;
  home?: string;
  agent?: string;
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
  customerPrompt?: string;
};

type WorkflowRiskItem = {
  severity?: string;
  title?: string;
  ownerMember?: {
    user?: {
      name?: string | null;
    } | null;
  } | null;
};

type WorkflowTaskItem = {
  title?: string;
  status?: string;
  priority?: string;
  dueTime?: Date | null;
  module?: {
    name?: string | null;
  } | null;
  owner?: {
    name?: string | null;
  } | null;
  needsHelp?: boolean;
};

type WorkflowReminderItem = {
  title?: string;
  content?: string;
};

type AgentPayloadText = {
  text?: string;
};

type AgentRawOutput = {
  reply?: string;
  text?: string;
  message?: string;
  content?: string;
  response?: string;
  data?: {
    reply?: string;
    text?: string;
  };
  result?: {
    reply?: string;
    text?: string;
    message?: string;
    content?: string;
    payloads?: AgentPayloadText[];
  };
};

type AgentPayloadHeader = {
  provider?: string;
};

type AgentManagerReport = {
  summary?: string | null;
  title?: string | null;
};

const execFileAsync = promisify(execFile);

@Injectable()
export class AgentsService {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveProject(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
        },
        tasks: {
          where: {
            status: {
              notIn: ['COMPLETED', 'CANCELLED'],
            },
          },
          include: {
            owner: true,
            module: true,
          },
          orderBy: [{ dueTime: 'asc' }, { createdAt: 'desc' }],
          take: 12,
        },
        events: {
          where: {
            status: 'pending_review',
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        },
      },
    });
  }

  async getIntegration(projectId: string, provider: string) {
    const project = await this.resolveProject(projectId);
    return this.prisma.agentIntegrationSetting.findUnique({
      where: {
        projectId_provider: {
          projectId: project?.id || projectId,
          provider,
        },
      },
      include: {
        project: true,
        events: {
          orderBy: { receivedAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  async upsertIntegration(projectId: string, dto: UpsertAgentIntegrationDto) {
    const project = await this.resolveProject(projectId);
    return this.prisma.agentIntegrationSetting.upsert({
      where: {
        projectId_provider: {
          projectId: project?.id || projectId,
          provider: dto.provider,
        },
      },
      create: {
        projectId: project?.id || projectId,
        provider: dto.provider,
        displayName: dto.displayName,
        webhookUrl: dto.webhookUrl,
        webhookSecret: dto.webhookSecret,
        enabled: dto.enabled ?? true,
        capabilities: dto.capabilities as Prisma.InputJsonValue | undefined,
        config: dto.config as Prisma.InputJsonValue | undefined,
      },
      update: {
        displayName: dto.displayName,
        webhookUrl: dto.webhookUrl,
        webhookSecret: dto.webhookSecret,
        enabled: dto.enabled,
        capabilities: dto.capabilities as Prisma.InputJsonValue | undefined,
        config: dto.config as Prisma.InputJsonValue | undefined,
      },
      include: {
        project: true,
        events: {
          orderBy: { receivedAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  async listEvents(projectId: string, provider?: string) {
    const project = await this.resolveProject(projectId);
    return this.prisma.agentInboundEvent.findMany({
      where: {
        projectId: project?.id || projectId,
        ...(provider ? { provider } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      include: {
        integration: true,
      },
    });
  }

  async handleWebhook(payload: AgentWebhookPayload) {
    if (payload?.challenge) {
      return { challenge: payload.challenge };
    }

    const header =
      payload.header && typeof payload.header === 'object'
        ? (payload.header as AgentPayloadHeader)
        : undefined;
    const provider = String(payload.provider || header?.provider || 'unknown');
    const projectId = String(payload?.projectId || payload?.project_id || '');
    const eventType = String(payload?.eventType || payload?.event_type || 'unknown');
    const externalEventId = payload?.eventId || payload?.event_id || null;

    if (!projectId) {
      return { ok: false, reason: 'missing_project_id' };
    }

    const integration = await this.prisma.agentIntegrationSetting.findFirst({
      where: {
        projectId,
        provider,
      },
    });

    const record = await this.prisma.agentInboundEvent.create({
      data: {
        projectId,
        integrationId: integration?.id ?? null,
        provider,
        eventType,
        externalEventId: externalEventId ? String(externalEventId) : undefined,
        payload: payload as Prisma.InputJsonValue,
        status: integration?.enabled ? AgentInboundEventStatus.NEW : AgentInboundEventStatus.IGNORED,
        processedAt: integration?.enabled ? undefined : new Date(),
      },
    });

    return {
      ok: true,
      eventId: record.id,
      accepted: Boolean(integration?.enabled),
    };
  }

  async acknowledgeEvent(eventId: string, note?: string) {
    return this.prisma.agentInboundEvent.update({
      where: { id: eventId },
      data: {
        status: AgentInboundEventStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: note ?? null,
      },
    });
  }

  async chat(projectIdentifier: string, dto: ChatAgentDto) {
    const provider = dto.provider || 'openclaw';
    const project = await this.resolveProject(projectIdentifier);
    if (!project) {
      return {
        ok: false,
        reason: 'project_not_found',
      };
    }

    const integration = await this.resolveOrCreateIntegration(project.id, provider);

    if (!integration?.enabled) {
      return {
        ok: false,
        reason: 'integration_disabled',
      };
    }

    const config = this.normalizeConfig(integration.config);
    const sessionId = this.resolveSessionId(project.id, dto);
    const result =
      provider === 'codex' || config.mode === 'builtin'
        ? {
            sessionId,
            raw: { mode: 'builtin' },
            text: this.buildBuiltinCustomerReply(project, dto.message),
          }
        : await this.runOpenClawAgent({
            projectId: project.id,
            provider,
            message: this.buildCustomerServicePrompt(project, dto.message, config, dto),
            sessionId,
            config,
            timeoutSeconds: dto.timeoutSeconds,
          });

    const record = await this.prisma.agentInboundEvent.create({
      data: {
        projectId: project.id,
        integrationId: integration.id,
        provider,
        eventType: 'customer_service.chat',
        externalEventId: undefined,
        payload: {
          userMessage: dto.message,
          provider,
          sessionId: result.sessionId,
          agentText: result.text,
          rawAgentResult: result.raw,
        } as Prisma.InputJsonValue,
        status: AgentInboundEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      eventId: record.id,
      provider,
      sessionId: result.sessionId,
      reply: result.text,
      raw: result.raw,
    };
  }

  async runManagerBrief(projectIdentifier: string, dto: ManagerWorkflowDto) {
    const provider = dto.provider || 'codex';
    const project = await this.resolveProject(projectIdentifier);
    if (!project) {
      return { ok: false, reason: 'project_not_found' };
    }

    const integration = await this.resolveOrCreateIntegration(project.id, provider);
    if (!integration?.enabled) {
      return { ok: false, reason: 'integration_disabled' };
    }

    const [riskItems, latestRiskReport, memberLoad] = await Promise.all([
      this.prisma.riskItem.findMany({
        where: {
          projectId: project.id,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
        include: {
          ownerMember: { include: { user: true } },
        },
        orderBy: [{ severity: 'desc' }, { identifiedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.aIReport.findFirst({
        where: {
          projectId: project.id,
          type: 'RISK',
        },
        orderBy: { reportDate: 'desc' },
      }),
      this.summarizeMemberLoad(project.id),
    ]);

    const config = this.normalizeConfig(integration.config);
    const sessionId = this.resolveWorkflowSessionId(project.id, dto.sessionId, 'manager-brief');
    const prompt = this.buildManagerWorkflowPrompt(project, riskItems, latestRiskReport, memberLoad, dto.focus);
    const result =
      provider === 'codex' || config.mode === 'builtin'
        ? {
            sessionId,
            raw: { mode: 'builtin', workflow: 'manager_brief' },
            text: this.buildBuiltinManagerBrief(project, riskItems, latestRiskReport, memberLoad, dto.focus),
          }
        : await this.runOpenClawAgent({
            projectId: project.id,
            provider,
            message: prompt,
            sessionId,
            config,
            timeoutSeconds: dto.timeoutSeconds,
          });

    const record = await this.prisma.agentInboundEvent.create({
      data: {
        projectId: project.id,
        integrationId: integration.id,
        provider,
        eventType: 'workflow.manager_brief',
        payload: {
          focus: dto.focus,
          sessionId: result.sessionId,
          reply: result.text,
        } as Prisma.InputJsonValue,
        status: AgentInboundEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      workflow: 'manager_brief',
      eventId: record.id,
      provider,
      sessionId: result.sessionId,
      reply: result.text,
      raw: result.raw,
    };
  }

  async runMemberBrief(projectIdentifier: string, dto: MemberWorkflowDto) {
    const provider = dto.provider || 'codex';
    const project = await this.resolveProject(projectIdentifier);
    if (!project) {
      return { ok: false, reason: 'project_not_found' };
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { id: dto.memberId },
      include: { user: true },
    });
    if (!member || member.projectId !== project.id) {
      return { ok: false, reason: 'member_not_found' };
    }

    const integration = await this.resolveOrCreateIntegration(project.id, provider);
    if (!integration?.enabled) {
      return { ok: false, reason: 'integration_disabled' };
    }

    const [tasks, reminders, risks] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          projectId: project.id,
          OR: [{ ownerMemberId: member.id }, { assistantMemberId: member.id }],
          status: { in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'] },
        },
        include: {
          module: true,
        },
        orderBy: [{ dueTime: 'asc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.notification.findMany({
        where: {
          projectId: project.id,
          receiverId: member.userId,
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 8,
      }),
      this.prisma.riskItem.findMany({
        where: {
          projectId: project.id,
          ownerMemberId: member.id,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
        orderBy: [{ severity: 'desc' }, { identifiedAt: 'desc' }],
        take: 5,
      }),
    ]);

    const config = this.normalizeConfig(integration.config);
    const sessionId = this.resolveWorkflowSessionId(project.id, dto.sessionId, `member-${member.id}`);
    const prompt = this.buildMemberWorkflowPrompt(project, member.user.name, tasks, reminders, risks, dto.focus);
    const result =
      provider === 'codex' || config.mode === 'builtin'
        ? {
            sessionId,
            raw: { mode: 'builtin', workflow: 'member_brief' },
            text: this.buildBuiltinMemberBrief(project.name, member.user.name, tasks, reminders, risks, dto.focus),
          }
        : await this.runOpenClawAgent({
            projectId: project.id,
            provider,
            message: prompt,
            sessionId,
            config,
            timeoutSeconds: dto.timeoutSeconds,
          });

    const record = await this.prisma.agentInboundEvent.create({
      data: {
        projectId: project.id,
        integrationId: integration.id,
        provider,
        eventType: 'workflow.member_brief',
        payload: {
          memberId: member.id,
          focus: dto.focus,
          sessionId: result.sessionId,
          reply: result.text,
        } as Prisma.InputJsonValue,
        status: AgentInboundEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    return {
      ok: true,
      workflow: 'member_brief',
      eventId: record.id,
      provider,
      sessionId: result.sessionId,
      reply: result.text,
      raw: result.raw,
    };
  }

  private normalizeConfig(value: Prisma.JsonValue | null | undefined): AgentConfig {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as AgentConfig;
  }

  private async resolveOrCreateIntegration(projectId: string, provider: string) {
    let integration = await this.prisma.agentIntegrationSetting.findUnique({
      where: {
        projectId_provider: {
          projectId,
          provider,
        },
      },
    });

    if (!integration && provider === 'codex') {
      integration = await this.prisma.agentIntegrationSetting.create({
        data: {
          projectId,
          provider,
          displayName: 'Codex 客服',
          enabled: true,
          capabilities: ['customer_service', 'project_qa', 'manager_brief', 'member_brief'],
          config: { mode: 'builtin' } as Prisma.InputJsonValue,
        },
      });
    }

    if (!integration && provider === 'openclaw') {
      integration = await this.prisma.agentIntegrationSetting.create({
        data: {
          projectId,
          provider,
          displayName: 'OpenClaw 客服',
          enabled: true,
          capabilities: ['customer_service', 'project_qa', 'manager_brief', 'member_brief'],
          config: this.defaultOpenClawConfig() as Prisma.InputJsonValue,
        },
      });
    }

    return integration;
  }

  private buildCustomerServicePrompt(
    project: Awaited<ReturnType<AgentsService['resolveProject']>> & {},
    message: string,
    config: AgentConfig,
    dto: ChatAgentDto,
  ) {
    if (dto.includeProjectContext === false) {
      return `${config.customerPrompt || this.defaultCustomerPrompt()}\n\n用户问题：${message}`;
    }

    const taskLines = (project.tasks || []).map((task) => {
      const owner = task.owner?.name || '未指定';
      const moduleName = task.module?.name || '项目级';
      const due = task.dueTime ? task.dueTime.toISOString() : '无截止时间';
      return `- ${task.title}｜${task.status}｜${task.priority}｜${moduleName}｜负责人 ${owner}｜截止 ${due}`;
    });

    const eventLines = (project.events || []).map((event) => {
      return `- ${event.title}｜来源 ${event.sourceType}/${event.sourceChannel || '未知'}｜发送人 ${event.sourceSender || '未知'}`;
    });

    const moduleNames = (project.modules || []).map((module) => module.name).join('、') || '暂无模块';

    return [
      config.customerPrompt || this.defaultCustomerPrompt(),
      '',
      `当前项目：${project.name} (${project.code || project.id})`,
      `项目模块：${moduleNames}`,
      '',
      '当前待处理任务：',
      taskLines.length ? taskLines.join('\n') : '暂无待处理任务。',
      '',
      '待确认事件：',
      eventLines.length ? eventLines.join('\n') : '暂无待确认事件。',
      '',
      `用户问题：${message}`,
    ].join('\n');
  }

  private defaultCustomerPrompt() {
    return [
      '你是 Golden Project 的项目客服 Agent。',
      '请用中文回答，语气简洁、可靠、适合活动执行团队。',
      '优先基于提供的项目、任务、事件上下文回答。',
      '如果信息不足，请明确说需要补充什么，不要编造。',
      '如果用户请求下一步行动，请给出 1-3 条可执行建议。',
    ].join('\n');
  }

  private buildManagerWorkflowPrompt(
    project: Awaited<ReturnType<AgentsService['resolveProject']>> & {},
    riskItems: WorkflowRiskItem[],
    latestRiskReport: AgentManagerReport | null,
    memberLoad: Array<{ userId: string; name: string; count: number }>,
    focus?: string,
  ) {
    const riskLines = riskItems.map((risk) => {
      const owner = risk.ownerMember?.user?.name || '待指定';
      return `- [${risk.severity}] ${risk.title}｜负责人 ${owner}`;
    });
    const taskLines = (project.tasks || []).map((task) => {
      return `- ${task.title}｜${task.status}｜${task.priority}｜负责人 ${task.owner?.name || '未指定'}`;
    });
    const eventLines = (project.events || []).map((event) => {
      return `- ${event.title}｜${event.sourceType}/${event.sourceChannel || '未知来源'}`;
    });
    const loadLines = memberLoad.slice(0, 5).map((item) => `- ${item.name}：${item.count} 个活跃任务`);

    return [
      '你是 Golden Project 的项目经理 Agent。',
      '请基于项目上下文输出今日经理简报，优先说风险、遗漏、谁需要催办、下一步动作。',
      '请用中文，简洁，可执行。',
      focus ? `本次关注点：${focus}` : '',
      '',
      `项目：${project.name} (${project.code || project.id})`,
      latestRiskReport ? `最新风险报告：${latestRiskReport.summary || latestRiskReport.title}` : '暂无风险报告。',
      '',
      '风险项：',
      riskLines.length ? riskLines.join('\n') : '暂无开放风险项。',
      '',
      '活跃任务：',
      taskLines.length ? taskLines.join('\n') : '暂无活跃任务。',
      '',
      '待确认事项：',
      eventLines.length ? eventLines.join('\n') : '暂无待确认事项。',
      '',
      '成员负载：',
      loadLines.length ? loadLines.join('\n') : '暂无成员负载数据。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildMemberWorkflowPrompt(
    project: Awaited<ReturnType<AgentsService['resolveProject']>> & {},
    memberName: string,
    tasks: WorkflowTaskItem[],
    reminders: WorkflowReminderItem[],
    risks: WorkflowRiskItem[],
    focus?: string,
  ) {
    const taskLines = tasks.map((task) => {
      return `- ${task.title}｜${task.status}｜${task.priority}｜${task.module?.name || '项目级'}｜截止 ${task.dueTime ? task.dueTime.toISOString() : '未设置'}`;
    });
    const reminderLines = reminders.map((item) => `- ${item.title}｜${item.content}`);
    const riskLines = risks.map((risk) => `- [${risk.severity}] ${risk.title}`);

    return [
      '你是 Golden Project 的执行助手 Agent。',
      '请告诉执行人员今天先做什么、哪些任务快到期、有哪些提醒需要回复、需要找谁。',
      '请用中文，简洁，可执行。',
      focus ? `本次关注点：${focus}` : '',
      '',
      `项目：${project.name}`,
      `成员：${memberName}`,
      '',
      '我的任务：',
      taskLines.length ? taskLines.join('\n') : '当前没有分配任务。',
      '',
      '我的提醒：',
      reminderLines.length ? reminderLines.join('\n') : '当前没有提醒。',
      '',
      '与我相关的风险：',
      riskLines.length ? riskLines.join('\n') : '当前没有直接挂到你的风险项。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildBuiltinManagerBrief(
    project: Awaited<ReturnType<AgentsService['resolveProject']>> & {},
    riskItems: WorkflowRiskItem[],
    latestRiskReport: AgentManagerReport | null,
    memberLoad: Array<{ userId: string; name: string; count: number }>,
    focus?: string,
  ) {
    const overdueTasks = (project.tasks || []).filter(
      (task) => task.dueTime && task.dueTime < new Date(),
    );
    const helpTasks = (project.tasks || []).filter((task) => task.needsHelp);
    const pendingEvents = project.events || [];
    const topRisks = riskItems.slice(0, 3);
    const actions: string[] = [];

    if (topRisks[0]) {
      actions.push(`先处理最高风险「${topRisks[0].title}」`);
    }
    if (pendingEvents[0]) {
      actions.push(`确认待确认事项「${pendingEvents[0].title}」是否转任务`);
    }
    if (memberLoad[0]) {
      actions.push(`检查 ${memberLoad[0].name} 的任务负载，目前 ${memberLoad[0].count} 个活跃任务`);
    }

    return [
      `项目经理简报：${project.name}`,
      focus ? `关注点：${focus}` : null,
      latestRiskReport?.summary ? `最新风险报告：${latestRiskReport.summary}` : null,
      `开放风险：${riskItems.length} 项；逾期任务：${overdueTasks.length} 项；求助任务：${helpTasks.length} 项；待确认事项：${pendingEvents.length} 项。`,
      topRisks.length
        ? `当前优先风险：\n${topRisks
            .map((risk, index) => `${index + 1}. [${risk.severity}] ${risk.title}`)
            .join('\n')}`
        : '当前没有开放风险项。',
      actions.length ? `建议下一步：\n${actions.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '当前没有明显的优先动作。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildBuiltinMemberBrief(
    projectName: string,
    memberName: string,
    tasks: WorkflowTaskItem[],
    reminders: WorkflowReminderItem[],
    risks: WorkflowRiskItem[],
    focus?: string,
  ) {
    const urgentTasks = tasks.filter((task) => task.priority === 'HIGH' || task.priority === 'URGENT');
    const nextTask = tasks[0];
    const actions: string[] = [];

    if (nextTask) {
      actions.push(`先推进「${nextTask.title}」`);
    }
    if (reminders[0]) {
      actions.push(`处理提醒「${reminders[0].title}」`);
    }
    if (risks[0]) {
      actions.push(`优先回复风险相关事项「${risks[0].title}」`);
    }

    return [
      `${memberName} 的执行简报`,
      `项目：${projectName}`,
      focus ? `关注点：${focus}` : null,
      `当前任务：${tasks.length} 项；高优先级：${urgentTasks.length} 项；提醒：${reminders.length} 条；关联风险：${risks.length} 项。`,
      nextTask
        ? `当前最先处理：${nextTask.title}（${nextTask.module?.name || '项目级'}，截止 ${nextTask.dueTime ? nextTask.dueTime.toISOString() : '未设置'}）`
        : '当前没有分配中的任务。',
      actions.length ? `建议下一步：\n${actions.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '当前没有需要优先处理的动作。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildBuiltinCustomerReply(
    project: Awaited<ReturnType<AgentsService['resolveProject']>> & {},
    message: string,
  ) {
    const tasks = project.tasks || [];
    const pendingEvents = project.events || [];
    const overdueTasks = tasks.filter((task) => task.status === 'OVERDUE');
    const urgentTasks = tasks.filter(
      (task) => task.priority === 'URGENT' || task.priority === 'HIGH',
    );
    const nextTask = tasks[0];
    const text = message.trim();
    const isProjectDateQuestion =
      /几号|哪天|日期|时间|什么时候|开始|结束|到几号/.test(text) &&
      /活动|项目|正式|开展|举办|会期|开幕/.test(text);

    if (isProjectDateQuestion) {
      const start = this.formatCustomerDate(project.startDate);
      const end = this.formatCustomerDate(project.endDate);

      if (project.startDate && project.endDate) {
        return `项目「${project.name}」正式开展时间是 ${start} 到 ${end}。`;
      }

      if (project.startDate) {
        return `项目「${project.name}」当前记录的开始时间是 ${start}，结束时间还没有录入。`;
      }

      if (project.endDate) {
        return `项目「${project.name}」当前记录的结束时间是 ${end}，开始时间还没有录入。`;
      }

      return `项目「${project.name}」还没有录入正式开展日期，请先补充开始和结束时间。`;
    }

    if (/风险|危险|逾期|卡点|问题/.test(text)) {
      const riskLines = [
        overdueTasks.length
          ? `有 ${overdueTasks.length} 个逾期任务，先处理「${overdueTasks[0].title}」。`
          : '当前未看到逾期任务。',
        urgentTasks.length
          ? `有 ${urgentTasks.length} 个高优先级任务，优先跟进「${urgentTasks[0].title}」。`
          : '当前高优先级任务不多。',
        pendingEvents.length
          ? `还有 ${pendingEvents.length} 个待确认事件，需要项目经理确认是否转任务。`
          : '暂无待确认事件。',
      ];
      return riskLines.join('\n');
    }

    if (/今天|下一步|优先|先做|安排|现在做什么/.test(text)) {
      if (!nextTask) {
        return '当前项目没有待处理任务。建议先补充任务清单，或检查微信群/飞书消息是否有新的待办。';
      }

      return [
        `建议先处理：${nextTask.title}`,
        `负责人：${nextTask.owner?.name || '未指定'}`,
        `模块：${nextTask.module?.name || '项目级'}`,
        `截止：${nextTask.dueTime ? nextTask.dueTime.toISOString() : '未设置'}`,
      ].join('\n');
    }

    if (/事件|确认|消息|群/.test(text)) {
      if (!pendingEvents.length) {
        return '当前没有待确认事件。后续微信群/飞书消息整理出的事项，会先进入事件确认区。';
      }

      return [
        `当前有 ${pendingEvents.length} 个待确认事件。`,
        ...pendingEvents.slice(0, 3).map((event, index) => {
          return `${index + 1}. ${event.title}（来源：${event.sourceChannel || event.sourceType}）`;
        }),
      ].join('\n');
    }

    return [
      `我已读取项目「${project.name}」。`,
      `待处理任务：${tasks.length} 个；高优先级：${urgentTasks.length} 个；待确认事件：${pendingEvents.length} 个。`,
      nextTask ? `当前建议先看「${nextTask.title}」。` : '当前没有排在前面的待处理任务。',
    ].join('\n');
  }

  private formatCustomerDate(value: Date | null | undefined) {
    if (!value) {
      return '未设置';
    }

    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(value);
  }

  private resolveSessionId(projectId: string, dto: ChatAgentDto) {
    const raw = dto.sessionId || dto.customerId || 'dashboard';
    return `golden-cs-${projectId}-${raw}`.replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 140);
  }

  private resolveWorkflowSessionId(projectId: string, rawSessionId: string | undefined, fallback: string) {
    const raw = rawSessionId || fallback;
    return `golden-wf-${projectId}-${raw}`.replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 140);
  }

  private async summarizeMemberLoad(projectId: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        projectId,
        status: {
          in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'],
        },
      },
      include: {
        owner: true,
      },
    });

    const load = new Map<string, { userId: string; name: string; count: number }>();
    tasks.forEach((task) => {
      if (!task.ownerId || !task.owner) {
        return;
      }
      const current = load.get(task.ownerId) ?? {
        userId: task.ownerId,
        name: task.owner.name,
        count: 0,
      };
      current.count += 1;
      load.set(task.ownerId, current);
    });

    return Array.from(load.values()).sort((a, b) => b.count - a.count);
  }

  private async runOpenClawAgent(params: {
    projectId: string;
    provider: string;
    message: string;
    sessionId: string;
    config: AgentConfig;
    timeoutSeconds?: number;
  }) {
    const command = params.config.command || this.defaultOpenClawCommand();
    const args = [
      'agent',
      '--json',
      '--session-id',
      params.sessionId,
      '--message',
      params.message,
      '--timeout',
      String(params.timeoutSeconds || params.config.timeoutSeconds || 180),
    ];

    if (params.config.agent) {
      args.push('--agent', params.config.agent);
    }
    if (params.config.model) {
      args.push('--model', params.config.model);
    }
    if (params.config.thinking) {
      args.push('--thinking', params.config.thinking);
    }

    const env = {
      ...process.env,
      HOME: params.config.home || this.defaultRealHome(),
    };

    const output = await execFileAsync(command, args, {
      env,
      maxBuffer: 20 * 1024 * 1024,
      timeout: (params.timeoutSeconds || params.config.timeoutSeconds || 180) * 1000 + 5000,
    });

    const raw = this.parseAgentOutput(output.stdout);
    const text = this.extractAgentText(raw, output.stdout);

    return {
      sessionId: params.sessionId,
      raw,
      text,
    };
  }

  private defaultOpenClawCommand() {
    const globalPath = '/Users/xiaoguodelaoguo/.npm-global/bin/openclaw';
    return existsSync(globalPath) ? globalPath : 'openclaw';
  }

  private defaultOpenClawConfig(): AgentConfig {
    return {
      mode: 'openclaw-cli',
      command: this.defaultOpenClawCommand(),
      home: this.defaultRealHome(),
      timeoutSeconds: 180,
      customerPrompt: this.defaultCustomerPrompt(),
    };
  }

  private defaultRealHome() {
    const cwd = process.cwd();
    if (cwd.startsWith('/Users/')) {
      return cwd.split('/').slice(0, 3).join('/');
    }
    return this.appConfigService.getHomeDir();
  }

  private parseAgentOutput(stdout: string): AgentRawOutput {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      const jsonLine = trimmed
        .split('\n')
        .reverse()
        .find((line) => line.trim().startsWith('{') && line.trim().endsWith('}'));
      if (jsonLine) {
        try {
          return JSON.parse(jsonLine);
        } catch {
          return { text: trimmed };
        }
      }
      return { text: trimmed };
    }
  }

  private extractAgentText(raw: AgentRawOutput, stdout: string) {
    // OpenClaw CLI --json output: result.payloads[].text
    if (raw?.result?.payloads && Array.isArray(raw.result.payloads)) {
      const texts = raw.result.payloads
        .map((payload) => payload?.text)
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 0);
      if (texts.length > 0) {
        return texts.join('\n').trim();
      }
    }

    const candidates = [
      raw?.reply,
      raw?.text,
      raw?.message,
      raw?.content,
      raw?.response,
      raw?.result?.reply,
      raw?.result?.text,
      raw?.result?.message,
      raw?.result?.content,
      raw?.data?.reply,
      raw?.data?.text,
    ];

    const match = candidates.find((item) => typeof item === 'string' && item.trim());
    if (match) {
      return match.trim();
    }

    return stdout.trim() || 'OpenClaw 已返回结果，但未识别到文本回复。';
  }
}
