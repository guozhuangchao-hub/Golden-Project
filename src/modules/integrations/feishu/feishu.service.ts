import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  EventSourceType,
  FeishuInboundMessageStatus,
  FeishuProposalStatus,
  Prisma,
  Project,
} from '@prisma/client';
import { AppConfigService } from '../../../platform/config/app-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpsSignalsService } from '../../ops-signals/ops-signals.service';
import { UpsertFeishuSettingDto } from './dto/upsert-feishu-setting.dto';

type FeishuEventPayload = Record<string, unknown>;
type FeishuEventHeader = {
  token?: string;
  event_type?: string;
};

type FeishuEventMessage = {
  message_id?: string;
  chat_id?: string;
  content?: unknown;
  message_type?: string;
  msg_type?: string;
};

type FeishuEventSenderId = {
  open_id?: string;
  user_id?: string;
  union_id?: string;
  name?: string;
  nickname?: string;
  user_name?: string;
};

type FeishuEventSender = {
  sender_id?: FeishuEventSenderId;
};

type FeishuEventAction = {
  value?: unknown;
};

type FeishuEventBody = {
  message?: FeishuEventMessage;
  chat_id?: string;
  sender?: FeishuEventSender;
  action?: FeishuEventAction;
  user?: {
    open_id?: string;
  };
  user_id?: string;
  operator?: {
    open_id?: string;
  };
};

type FeishuProposalTask = {
  title: string;
  description: string;
  moduleName: string | null;
  ownerName: string | null;
  assistantName: string | null;
  priority: string;
  dueTime: string | null;
  sourceMessageId: string;
  sourceMessageText: string;
};

type FeishuCardContentItem = {
  text?: string;
};

@Injectable()
export class FeishuService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeishuService.name);
  private digestTimer?: NodeJS.Timeout;
  private tenantTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly opsSignalsService: OpsSignalsService,
  ) {}

  onModuleInit() {
    this.digestTimer = setInterval(() => {
      void this.tickDigestLoop();
    }, 60_000);
    this.digestTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.digestTimer) {
      clearInterval(this.digestTimer);
    }
  }

  async getProjectSetting(projectId: string) {
    return this.prisma.feishuProjectSetting.findUnique({
      where: { projectId },
      include: {
        project: true,
        manager: true,
      },
    });
  }

  async upsertProjectSetting(projectId: string, dto: UpsertFeishuSettingDto) {
    return this.prisma.feishuProjectSetting.upsert({
      where: { projectId },
      create: {
        projectId,
        managerUserId: dto.managerUserId,
        groupChatId: dto.groupChatId,
        summaryHour: dto.summaryHour ?? 22,
        summaryMinute: dto.summaryMinute ?? 0,
        timezone: dto.timezone ?? 'Asia/Shanghai',
        enabled: dto.enabled ?? true,
      },
      update: {
        managerUserId: dto.managerUserId,
        groupChatId: dto.groupChatId,
        summaryHour: dto.summaryHour,
        summaryMinute: dto.summaryMinute,
        timezone: dto.timezone,
        enabled: dto.enabled,
      },
      include: {
        project: true,
        manager: true,
      },
    });
  }

  async listInboundMessages(projectId: string) {
    return this.prisma.feishuMessage.findMany({
      where: { projectId },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  async listProposals(projectId: string) {
    return this.prisma.feishuTaskProposal.findMany({
      where: { projectId },
      orderBy: { summaryDate: 'desc' },
      include: {
        reviewedBy: true,
        setting: true,
      },
    });
  }

  async handleEventWebhook(payload: FeishuEventPayload) {
    if (payload?.challenge) {
      return { challenge: payload.challenge };
    }

    this.assertVerificationToken(payload);

    const header =
      payload.header && typeof payload.header === 'object'
        ? (payload.header as FeishuEventHeader)
        : undefined;
    const eventType = header?.event_type;
    if (eventType === 'im.message.receive_v1') {
      await this.ingestMessageEvent(payload);
    }

    return { ok: true };
  }

  async handleCallbackWebhook(payload: FeishuEventPayload) {
    if (payload?.challenge) {
      return { challenge: payload.challenge };
    }

    this.assertVerificationToken(payload);

    const header =
      payload.header && typeof payload.header === 'object'
        ? (payload.header as FeishuEventHeader)
        : undefined;
    const eventType =
      header?.event_type ||
      (typeof payload.event_type === 'string' ? payload.event_type : undefined) ||
      'card.action.trigger';
    if (eventType === 'card.action.trigger') {
      return this.handleCardAction(payload);
    }

    return { ok: true };
  }

  async runDigestForProject(projectId: string) {
    const setting = await this.prisma.feishuProjectSetting.findUnique({
      where: { projectId },
      include: {
        project: {
          include: {
            modules: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        manager: true,
      },
    });

    if (!setting?.enabled) {
      return { ok: false, reason: 'setting_disabled' };
    }

    return this.generateAndSendProposal(setting);
  }

  async runDigestLoop() {
    const settings = await this.prisma.feishuProjectSetting.findMany({
      where: {
        enabled: true,
      },
      include: {
        project: {
          include: {
            modules: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        manager: true,
      },
    });

    const results: unknown[] = [];
    for (const setting of settings) {
      if (!this.isDigestDue(setting)) {
        continue;
      }

      results.push(await this.generateAndSendProposal(setting));
    }

    return results;
  }

  private async tickDigestLoop() {
    try {
      await this.runDigestLoop();
    } catch (error) {
      this.logger.warn(
        `Digest loop failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isDigestDue(setting: {
    summaryHour: number;
    summaryMinute: number;
    lastDigestAt: Date | null;
  }) {
    const now = new Date();
    const scheduledMinutes = setting.summaryHour * 60 + setting.summaryMinute;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (currentMinutes < scheduledMinutes) {
      return false;
    }

    if (!setting.lastDigestAt) {
      return true;
    }

    return !this.isSameDay(setting.lastDigestAt, now);
  }

  private isSameDay(left: Date, right: Date) {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }

  private assertVerificationToken(payload: FeishuEventPayload) {
    const expected = this.appConfigService.getFeishuVerificationToken()?.trim();
    if (!expected) {
      return;
    }

    const header =
      payload.header && typeof payload.header === 'object'
        ? (payload.header as FeishuEventHeader)
        : undefined;
    const actual = header?.token;
    if (actual && actual !== expected) {
      throw new Error('Invalid Feishu verification token');
    }
  }

  private async ingestMessageEvent(payload: FeishuEventPayload) {
    const event =
      payload.event && typeof payload.event === 'object'
        ? (payload.event as FeishuEventBody)
        : {};
    const message = (event.message ?? event) as FeishuEventMessage;
    const messageId = message?.message_id;
    const chatId = message?.chat_id || event?.chat_id;
    if (!messageId || !chatId) {
      return { ok: false, reason: 'missing_message_fields' };
    }

    const setting = await this.prisma.feishuProjectSetting.findUnique({
      where: { groupChatId: chatId },
      include: {
        project: true,
      },
    });

    if (!setting) {
      return { ok: true, ignored: true };
    }

    const sender = event?.sender?.sender_id || {};
    const content = this.extractMessageContent(message?.content);
    const senderFeishuUserId = sender?.open_id || sender?.user_id || sender?.union_id || null;
    const senderName = sender?.name || sender?.nickname || sender?.user_name || null;

    await this.prisma.feishuMessage.upsert({
      where: { messageId },
      update: {
        projectId: setting.projectId,
        settingId: setting.id,
        chatId,
        senderFeishuUserId,
        senderName,
        messageType: message?.message_type || message?.msg_type || null,
        content,
        rawPayload: payload as Prisma.InputJsonValue,
        status: FeishuInboundMessageStatus.NEW,
      },
      create: {
        projectId: setting.projectId,
        settingId: setting.id,
        chatId,
        messageId,
        senderFeishuUserId,
        senderName,
        messageType: message?.message_type || message?.msg_type || null,
        content,
        rawPayload: payload as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  }

  private async handleCardAction(payload: FeishuEventPayload) {
    const event =
      payload.event && typeof payload.event === 'object'
        ? (payload.event as FeishuEventBody)
        : {};
    const actionValue = this.parseActionValue(event?.action?.value);
    const proposalId = actionValue?.proposalId;
    const decision = actionValue?.decision;

    if (!proposalId || !decision) {
      return {
        toast: {
          type: 'error',
          content: '缺少提案或操作信息',
        },
      };
    }

    const proposal = await this.prisma.feishuTaskProposal.findUnique({
      where: { id: proposalId },
      include: {
        project: {
          include: {
            modules: {
              orderBy: { sortOrder: 'asc' },
            },
            members: {
              include: { user: true },
            },
          },
        },
        setting: {
          include: {
            manager: true,
          },
        },
      },
    });

    if (!proposal) {
      return {
        toast: {
          type: 'error',
          content: '未找到对应的任务整理提案',
        },
      };
    }

    if (decision === 'approve') {
      await this.applyProposal(proposal, payload);
      return {
        toast: {
          type: 'success',
          content: '任务已确认并写回后台',
        },
        card: this.buildReviewedCard(proposal, '已确认并同步到后台'),
      };
    }

    await this.prisma.feishuTaskProposal.update({
      where: { id: proposal.id },
      data: {
        status: FeishuProposalStatus.REJECTED,
        managerComment: actionValue?.comment || '项目经理驳回了本次整理结果',
        reviewedAt: new Date(),
      },
    });

    return {
      toast: {
        type: 'info',
        content: '已驳回，本次整理不会写回后台',
      },
      card: this.buildReviewedCard(proposal, '已驳回，未写回后台'),
    };
  }

  private async generateAndSendProposal(setting: {
    id: string;
    projectId: string;
    groupChatId?: string | null;
    summaryHour: number;
    summaryMinute: number;
    lastDigestAt: Date | null;
    project: Project & {
      modules: Array<{ id: string; name: string; sortOrder: number }>;
      members?: Array<{
        id: string;
        userId: string;
        role: string;
        user: { id: string; name: string; feishuUserId: string | null };
      }>;
    };
    manager: { id: string; feishuUserId: string | null; name: string } | null;
  }) {
    const windowStart = setting.lastDigestAt
      ? setting.lastDigestAt
      : this.startOfToday();

    const messages = await this.prisma.feishuMessage.findMany({
      where: {
        projectId: setting.projectId,
        status: FeishuInboundMessageStatus.NEW,
        receivedAt: { gte: windowStart },
      },
      orderBy: { receivedAt: 'asc' },
    });

    if (!messages.length) {
      await this.prisma.feishuProjectSetting.update({
        where: { id: setting.id },
        data: {
          lastDigestAt: new Date(),
          lastSyncAt: new Date(),
        },
      });

      return { ok: true, skipped: true, reason: 'no_messages' };
    }

    const signalContext = {
      projectId: setting.projectId,
      sourceType: EventSourceType.feishu,
      moduleNames: setting.project.modules.map((module) => module.name),
      memberNames: (setting.project.members || []).map((member) => member.user.name),
    };
    const signals = this.opsSignalsService.extractSignals(
      messages.map((message) => ({
        sourceMessageId: message.messageId,
        senderName: message.senderName,
        sourceChannel: setting.groupChatId || 'feishu_group',
        content: message.content || '',
        receivedAt: message.receivedAt,
      })),
      signalContext,
    );
    await this.opsSignalsService.persistSignals(signalContext, signals);
    const systemUser = await this.ensureSystemUser();
    await this.opsSignalsService.createPendingEventsFromSignals({
      projectId: setting.projectId,
      sourceType: EventSourceType.feishu,
      systemUserId: systemUser.id || setting.project.createdById,
      signals,
    });
    const tasks = this.opsSignalsService.taskCandidatesFromSignals(signals) as FeishuProposalTask[];
    const summary = this.buildProposalSummary(setting, messages, signals, tasks);
    const now = new Date();

    const proposal = await this.prisma.feishuTaskProposal.create({
      data: {
        projectId: setting.projectId,
        settingId: setting.id,
        summaryDate: now,
        title: `${setting.project.name} 夜间任务整理`,
        summary,
        sourceMessages: messages.map((message) => ({
          messageId: message.messageId,
          senderName: message.senderName,
          content: message.content,
          receivedAt: message.receivedAt,
        })) as Prisma.InputJsonValue,
        proposedTasks: tasks as Prisma.InputJsonValue,
      },
    });

    if (
      setting.manager?.feishuUserId &&
      this.appConfigService.getFeishuAppId() &&
      this.appConfigService.getFeishuAppSecret()
    ) {
      try {
        const messageId = await this.sendReviewCard(setting.manager.feishuUserId, proposal, setting);
        await this.prisma.feishuTaskProposal.update({
          where: { id: proposal.id },
          data: { cardMessageId: messageId },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to send Feishu review card: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await this.prisma.feishuMessage.updateMany({
      where: {
        id: {
          in: messages.map((item) => item.id),
        },
      },
      data: {
        status: FeishuInboundMessageStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    await this.prisma.feishuProjectSetting.update({
      where: { id: setting.id },
      data: {
        lastDigestAt: new Date(),
        lastSyncAt: new Date(),
      },
    });

    return proposal;
  }

  private async ensureSystemUser() {
    return this.prisma.user.upsert({
      where: { email: 'system-feishu-digest@golden.local' },
      update: {},
      create: {
        name: '飞书消息整理器',
        email: 'system-feishu-digest@golden.local',
        remark: '用于飞书群消息整理和待确认事项生成',
      },
    });
  }

  private buildProposalSummary(
    setting: {
      project: { name: string; modules: Array<{ name: string }> };
    },
    messages: Array<{ senderName: string | null; content: string | null; receivedAt: Date }>,
    signals: ReturnType<OpsSignalsService['extractSignals']>,
    tasks: FeishuProposalTask[],
  ) {
    const authors = Array.from(new Set(messages.map((item) => item.senderName).filter(Boolean)));
    const moduleCount = Array.from(
      new Set(tasks.map((item) => item.moduleName).filter(Boolean)),
    ).length;

    const topItems = tasks.slice(0, 5).map((task) => `- ${task.title} · ${task.ownerName || '待指定负责人'}`);

    return [
      this.opsSignalsService.buildSignalSummary(setting.project.name, messages.length, signals),
      `任务候选覆盖 ${moduleCount} 个模块。`,
      authors.length ? `相关沟通人：${authors.join('、')}` : '当前消息未识别到明确沟通人。',
      tasks.length ? `待确认事项预览：\n${topItems.join('\n')}` : '当前未提取到明确待办，建议项目经理补充任务描述。',
    ].join('\n\n');
  }

  private buildReviewCard(
    proposal: {
      id: string;
      title: string;
      summary: string;
      summaryDate: Date;
      proposedTasks: Prisma.JsonValue | null;
    },
    setting: {
      project: { name: string };
    },
  ) {
    const taskItems = this.normalizeProposalTasks(proposal.proposedTasks);
    const preview = taskItems.slice(0, 5).map((task, index) => {
      return `**${index + 1}. ${task.title || '未命名事项'}**\n- 负责人：${task.ownerName || '待确认'}\n- 模块：${task.moduleName || '未匹配'}\n- 截止：${task.dueTime || '未识别'}\n- 优先级：${task.priority || 'MEDIUM'}`;
    });

    return {
      schema: '2.0',
      config: {
        wide_screen_mode: true,
        update_multi: true,
        enable_forward: true,
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: `项目任务确认 · ${setting.project.name}`,
        },
      },
      body: {
        elements: [
          {
            tag: 'markdown',
            content: proposal.summary,
          },
          {
            tag: 'divider',
          },
          {
            tag: 'markdown',
            content: preview.length ? preview.join('\n\n') : '当前没有识别到明确的待确认任务。',
          },
          {
            tag: 'column_set',
            flex_mode: 'flow',
            columns: [
              {
                tag: 'column',
                width: 'auto',
                weight: 1,
                elements: [
                  {
                    tag: 'button',
                    text: {
                      tag: 'plain_text',
                      content: '确认写回',
                    },
                    type: 'primary',
                    size: 'medium',
                    width: 'default',
                    behaviors: [
                      {
                        type: 'callback',
                        value: {
                          proposalId: proposal.id,
                          decision: 'approve',
                        },
                      },
                    ],
                  },
                ],
              },
              {
                tag: 'column',
                width: 'auto',
                weight: 1,
                elements: [
                  {
                    tag: 'button',
                    text: {
                      tag: 'plain_text',
                      content: '驳回',
                    },
                    type: 'danger',
                    size: 'medium',
                    width: 'default',
                    behaviors: [
                      {
                        type: 'callback',
                        value: {
                          proposalId: proposal.id,
                          decision: 'reject',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  private buildReviewedCard(
    proposal: {
      summary: string;
      title: string;
    },
    headline: string,
  ) {
    return {
      schema: '2.0',
      config: {
        wide_screen_mode: true,
        update_multi: true,
        enable_forward: true,
      },
      header: {
        template: 'green',
        title: {
          tag: 'plain_text',
          content: headline,
        },
      },
      body: {
        elements: [
          {
            tag: 'markdown',
            content: proposal.summary,
          },
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: '确认后任务已同步到 Golden Project 后台。',
              },
            ],
          },
        ],
      },
    };
  }

  private async sendReviewCard(
    receiveId: string,
    proposal: {
      id: string;
      summary: string;
      summaryDate: Date;
      proposedTasks: Prisma.JsonValue | null;
      title: string;
    },
    setting: {
      project: { name: string };
    },
  ) {
    const card = this.buildReviewCard(proposal, setting);
    const token = await this.getTenantAccessToken();
    const response = await fetch(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: 'interactive',
          content: JSON.stringify(card),
        }),
      },
    );

    const body = await response.json();
    if (!response.ok || body?.code !== 0) {
      throw new Error(body?.msg || `Feishu send message failed with status ${response.status}`);
    }

    return body?.data?.message_id as string;
  }

  private async getTenantAccessToken() {
    const appId = this.appConfigService.getFeishuAppId()?.trim();
    const appSecret = this.appConfigService.getFeishuAppSecret()?.trim();
    if (!appId || !appSecret) {
      throw new Error('Missing FEISHU_APP_ID or FEISHU_APP_SECRET');
    }

    if (this.tenantTokenCache && this.tenantTokenCache.expiresAt - Date.now() > 60_000) {
      return this.tenantTokenCache.token;
    }

    const response = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret,
        }),
      },
    );

    const body = await response.json();
    if (!response.ok || body?.code !== 0 || !body?.tenant_access_token) {
      throw new Error(body?.msg || `Failed to fetch tenant_access_token (${response.status})`);
    }

    const expireSeconds = Number(body?.expire || 7200);
    this.tenantTokenCache = {
      token: body.tenant_access_token,
      expiresAt: Date.now() + expireSeconds * 1000,
    };

    return body.tenant_access_token as string;
  }

  private extractMessageContent(rawContent: unknown) {
    if (typeof rawContent !== 'string') {
      return rawContent ? JSON.stringify(rawContent) : '';
    }

    const trimmed = rawContent.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        return parsed;
      }

      if (typeof parsed?.text === 'string') {
        return parsed.text;
      }

      if (typeof parsed?.content === 'string') {
        return parsed.content;
      }

      if (Array.isArray(parsed?.content)) {
        return parsed.content
          .map((item) => {
            const value = item as FeishuCardContentItem;
            return typeof value?.text === 'string' ? value.text : '';
          })
          .filter(Boolean)
          .join('\n');
      }

      return JSON.stringify(parsed);
    } catch {
      return trimmed;
    }
  }

  private parseActionValue(value: unknown) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { raw: value };
      }
    }

    return value as Record<string, unknown>;
  }

  private normalizeProposalTasks(value: Prisma.JsonValue | null): FeishuProposalTask[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const raw = item as Record<string, unknown>;
        return {
          title: typeof raw.title === 'string' ? raw.title : '',
          description: typeof raw.description === 'string' ? raw.description : '',
          moduleName: typeof raw.moduleName === 'string' ? raw.moduleName : null,
          ownerName: typeof raw.ownerName === 'string' ? raw.ownerName : null,
          assistantName:
            typeof raw.assistantName === 'string' ? raw.assistantName : null,
          priority: typeof raw.priority === 'string' ? raw.priority : 'MEDIUM',
          dueTime: typeof raw.dueTime === 'string' ? raw.dueTime : null,
          sourceMessageId:
            typeof raw.sourceMessageId === 'string' ? raw.sourceMessageId : '',
          sourceMessageText:
            typeof raw.sourceMessageText === 'string' ? raw.sourceMessageText : '',
        } satisfies FeishuProposalTask;
      })
      .filter((item): item is FeishuProposalTask => Boolean(item));
  }

  private startOfToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private async applyProposal(
    proposal: {
      id: string;
      projectId: string;
      proposedTasks: Prisma.JsonValue | null;
      summary: string;
      settingId: string | null;
    },
    payload: FeishuEventPayload,
  ) {
    const setting = await this.prisma.feishuProjectSetting.findUnique({
      where: { projectId: proposal.projectId },
      include: {
        project: {
          include: {
            modules: true,
            members: {
              include: {
                user: true,
              },
            },
          },
        },
        manager: true,
      },
    });

    if (!setting) {
      throw new Error('Feishu project setting not found');
    }

    const items = this.normalizeProposalTasks(proposal.proposedTasks);
    const createdTaskIds: string[] = [];

    for (const rawItem of items) {
      const module = this.matchModule(setting.project.modules, rawItem.moduleName);
      const ownerMember = this.matchProjectMember(setting.project.members, rawItem.ownerName);
      const assistantMember = this.matchProjectMember(setting.project.members, rawItem.assistantName);

      const task = await this.prisma.task.create({
        data: {
          projectId: proposal.projectId,
          moduleId: module?.id,
          title: rawItem.title,
          description: `${rawItem.description}\n\n来源：飞书群消息整理`,
          priority:
            rawItem.priority === 'HIGH' ||
            rawItem.priority === 'URGENT' ||
            rawItem.priority === 'LOW'
              ? rawItem.priority
              : 'MEDIUM',
          status: 'PENDING_CONFIRMATION',
          ownerId: ownerMember?.userId,
          ownerMemberId: ownerMember?.id,
          assistantId: assistantMember?.userId,
          assistantMemberId: assistantMember?.id,
          dueTime: rawItem.dueTime ? new Date(rawItem.dueTime) : undefined,
          createdById: setting.manager?.id || setting.project.createdById,
          logs: {
            create: {
              action: 'CREATED',
              content: '由飞书群消息夜间整理并经项目经理确认创建',
              extraData: {
                source: 'feishu',
                proposalId: proposal.id,
                sourceMessageId: rawItem.sourceMessageId,
              },
            },
          },
        },
      });

      createdTaskIds.push(task.id);
    }

    const reviewedById = this.resolveReviewerId(payload, setting.project);

    await this.prisma.feishuTaskProposal.update({
      where: { id: proposal.id },
      data: {
        status: FeishuProposalStatus.APPLIED,
        reviewedById,
        reviewedAt: new Date(),
        appliedAt: new Date(),
        managerComment: '项目经理已确认并同步到后台',
      },
    });

    await this.prisma.feishuProjectSetting.update({
      where: { id: setting.id },
      data: {
        lastDigestAt: new Date(),
        lastSyncAt: new Date(),
      },
    });

    await this.prisma.feishuMessage.updateMany({
      where: {
        projectId: proposal.projectId,
        status: FeishuInboundMessageStatus.PROCESSED,
      },
      data: {
        processedAt: new Date(),
      },
    });

    return createdTaskIds;
  }

  private resolveReviewerId(payload: FeishuEventPayload, project: { members: Array<{ user: { id: string; feishuUserId: string | null } }> }) {
    const event =
      payload.event && typeof payload.event === 'object'
        ? (payload.event as FeishuEventBody)
        : {};
    const senderOpenId =
      event?.user?.open_id ||
      event?.user_id ||
      event?.operator?.open_id ||
      null;

    if (!senderOpenId) {
      return undefined;
    }

    return project.members.find((member) => member.user.feishuUserId === senderOpenId)?.user.id;
  }

  private matchModule(modules: Array<{ id: string; name: string }>, moduleName?: string | null) {
    if (!moduleName) {
      return null;
    }

    return modules.find((module) => module.name.includes(moduleName) || moduleName.includes(module.name)) || null;
  }

  private matchProjectMember(
    members: Array<{
      id: string;
      userId: string;
      user: { id: string; name: string; feishuUserId: string | null };
    }>,
    label?: string | null,
  ) {
    if (!label) {
      return null;
    }

    return (
      members.find(
        (member) =>
          member.user.name.includes(label) ||
          label.includes(member.user.name) ||
          (member.user.feishuUserId && label.includes(member.user.feishuUserId)),
      ) || null
    );
  }
}
