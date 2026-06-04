import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  FeishuInboundMessageStatus,
  FeishuProposalStatus,
  Prisma,
  Project,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpsertFeishuSettingDto } from './dto/upsert-feishu-setting.dto';

type FeishuEventPayload = Record<string, any>;

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

@Injectable()
export class FeishuService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeishuService.name);
  private digestTimer?: NodeJS.Timeout;
  private tenantTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

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

    const eventType = payload?.header?.event_type;
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

    const eventType = payload?.header?.event_type || payload?.event_type || 'card.action.trigger';
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
    const expected = process.env.FEISHU_VERIFICATION_TOKEN?.trim();
    if (!expected) {
      return;
    }

    const actual = payload?.header?.token;
    if (actual && actual !== expected) {
      throw new Error('Invalid Feishu verification token');
    }
  }

  private async ingestMessageEvent(payload: FeishuEventPayload) {
    const event = payload?.event ?? {};
    const message = event?.message ?? event;
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
    const actionValue = this.parseActionValue(payload?.event?.action?.value);
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
        receivedAt: {
          gte: windowStart,
        },
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

    const tasks = this.extractProposalTasks(messages, setting);
    const summary = this.buildProposalSummary(setting, messages, tasks);
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

    if (setting.manager?.feishuUserId && process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
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

  private buildProposalSummary(
    setting: {
      project: { name: string; modules: Array<{ name: string }> };
    },
    messages: Array<{ senderName: string | null; content: string | null; receivedAt: Date }>,
    tasks: FeishuProposalTask[],
  ) {
    const messageCount = messages.length;
    const taskCount = tasks.length;
    const authors = Array.from(new Set(messages.map((item) => item.senderName).filter(Boolean)));
    const moduleCount = Array.from(
      new Set(tasks.map((item) => item.moduleName).filter(Boolean)),
    ).length;

    const topItems = tasks.slice(0, 5).map((task) => `- ${task.title} · ${task.ownerName || '待指定负责人'}`);

    return [
      `项目「${setting.project.name}」本次共收到 ${messageCount} 条群内沟通，整理出 ${taskCount} 个待确认事项，覆盖 ${moduleCount} 个模块。`,
      authors.length ? `相关沟通人：${authors.join('、')}` : '当前消息未识别到明确沟通人。',
      tasks.length ? `待确认事项预览：\n${topItems.join('\n')}` : '当前未提取到明确待办，建议项目经理补充任务描述。',
    ].join('\n\n');
  }

  private extractProposalTasks(
    messages: Array<{
      messageId: string;
      senderName: string | null;
      content: string | null;
      receivedAt: Date;
    }>,
    setting: {
      project: {
        modules: Array<{ id: string; name: string }>;
        members?: Array<{
          id: string;
          userId: string;
          role: string;
          user: { id: string; name: string; feishuUserId: string | null };
        }>;
      };
    },
  ) {
    const moduleNames = setting.project.modules.map((module) => module.name);
    const memberNames = (setting.project.members || []).map((member) => member.user.name);

    return messages.flatMap((message) => {
      const lines = this.splitCandidateLines(message.content || '');
      return lines
        .map((line) => this.extractTaskCandidate(line, message.messageId, moduleNames, memberNames))
        .filter((item): item is FeishuProposalTask => Boolean(item));
    });
  }

  private extractTaskCandidate(
    line: string,
    messageId: string,
    moduleNames: string[],
    memberNames: string[],
  ): FeishuProposalTask | null {
    const cleaned = line.trim().replace(/^[\-\*\d.、\s]+/, '');
    if (!cleaned) {
      return null;
    }

    const normalized = cleaned.replace(/\s+/g, ' ');
    const hasTaskKeyword =
      /(任务|待办|确认|安排|协调|对接|处理|推进|补充|跟进|提醒|同步|核对|提交|发送)/.test(normalized);
    if (!hasTaskKeyword) {
      return null;
    }

    const moduleName = moduleNames.find((name) => normalized.includes(name)) || null;
    const ownerName =
      memberNames.find((name) => normalized.includes(name)) ||
      this.matchExplicitName(normalized) ||
      null;
    const assistantName = this.matchAssistant(normalized, memberNames);
    const dueTime = this.matchDueTime(normalized);
    const priority = this.matchPriority(normalized);

    const title = normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;

    return {
      title,
      description: normalized,
      moduleName,
      ownerName,
      assistantName,
      priority,
      dueTime,
      sourceMessageId: messageId,
      sourceMessageText: normalized,
    };
  }

  private splitCandidateLines(content: string) {
    const base = content.trim();
    if (!base) {
      return [];
    }

    return base
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private matchExplicitName(text: string) {
    const atMatch = text.match(/@([\u4e00-\u9fa5A-Za-z0-9_·-]{2,20})/);
    return atMatch?.[1] || null;
  }

  private matchAssistant(text: string, memberNames: string[]) {
    const helperKeywords = ['协助', '支援', '配合', '帮忙', '助手'];
    if (!helperKeywords.some((keyword) => text.includes(keyword))) {
      return null;
    }

    return memberNames.find((name) => text.includes(name)) || null;
  }

  private matchDueTime(text: string) {
    const match =
      text.match(/(\d{1,2})[:：](\d{2})/) ||
      text.match(/(\d{1,2})点(?:([0-5]?\d)分?)?/) ||
      text.match(/(今天|明天|后天)/);

    if (!match) {
      return null;
    }

    if (match[1] === '今天' || match[1] === '明天' || match[1] === '后天') {
      const offset = match[1] === '今天' ? 0 : match[1] === '明天' ? 1 : 2;
      const base = new Date();
      base.setDate(base.getDate() + offset);
      base.setHours(18, 0, 0, 0);
      return base.toISOString();
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2] || match[3] || 0);
    const due = new Date();
    due.setHours(hours, minutes, 0, 0);
    return due.toISOString();
  }

  private matchPriority(text: string) {
    if (/(紧急|马上|立即|尽快|今天必须|高优先)/.test(text)) {
      return 'URGENT';
    }
    if (/(重要|优先|先处理)/.test(text)) {
      return 'HIGH';
    }
    if (/(可后置|不急|低优先)/.test(text)) {
      return 'LOW';
    }
    return 'MEDIUM';
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
    const taskItems = Array.isArray(proposal.proposedTasks) ? proposal.proposedTasks : [];
    const preview = taskItems.slice(0, 5).map((task: any, index: number) => {
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
    const appId = process.env.FEISHU_APP_ID?.trim();
    const appSecret = process.env.FEISHU_APP_SECRET?.trim();
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
          .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
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

    const items = Array.isArray(proposal.proposedTasks) ? proposal.proposedTasks : [];
    const createdTaskIds: string[] = [];

    for (const rawItem of items as any[]) {
      const module = this.matchModule(setting.project.modules, rawItem.moduleName);
      const ownerMember = this.matchProjectMember(setting.project.members, rawItem.ownerName);
      const assistantMember = this.matchProjectMember(setting.project.members, rawItem.assistantName);

      const task = await this.prisma.task.create({
        data: {
          projectId: proposal.projectId,
          moduleId: module?.id,
          title: rawItem.title,
          description: `${rawItem.description}\n\n来源：飞书群消息整理`,
          priority: rawItem.priority || 'MEDIUM',
          status: 'PENDING_CONFIRMATION',
          ownerId: ownerMember?.userId,
          ownerMemberId: ownerMember?.id,
          assistantId: assistantMember?.userId,
          assistantMemberId: assistantMember?.id,
          dueTime: rawItem.dueTime ? new Date(rawItem.dueTime) : undefined,
          createdById:
            setting.manager?.id || setting.project.createdById || 'SYSTEM_SEED_USER_ID',
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
    const senderOpenId =
      payload?.event?.user?.open_id ||
      payload?.event?.user_id ||
      payload?.event?.operator?.open_id ||
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
