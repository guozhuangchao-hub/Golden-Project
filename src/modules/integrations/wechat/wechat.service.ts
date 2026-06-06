import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  EventSourceType,
  EventStatus,
  Prisma,
  TaskLogAction,
  TaskPriority,
  VisibilityScope,
  WechatDigestStatus,
  WechatInboundMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ImportWechatMessageDto,
  ImportWechatMessagesDto,
} from './dto/import-wechat-messages.dto';
import { UpsertWechatSettingDto } from './dto/upsert-wechat-setting.dto';

type ExtractedWechatTask = {
  groupName: string;
  senderName: string;
  task: string;
  title: string;
  sourceMessageId: string;
  sourceMessageText: string;
  receivedAt: string;
};

@Injectable()
export class WechatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WechatService.name);
  private digestTimer?: NodeJS.Timeout;

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

  async getProjectSetting(projectIdentifier: string) {
    const project = await this.resolveProject(projectIdentifier);
    return this.prisma.wechatProjectSetting.findUnique({
      where: { projectId: project.id },
      include: { project: true },
    });
  }

  async upsertProjectSetting(projectIdentifier: string, dto: UpsertWechatSettingDto) {
    const project = await this.resolveProject(projectIdentifier);
    const interval = dto.digestIntervalMinutes ?? 10;

    return this.prisma.wechatProjectSetting.upsert({
      where: { projectId: project.id },
      create: {
        projectId: project.id,
        enabled: dto.enabled ?? true,
        groupNames: (dto.groupNames || []) as Prisma.InputJsonValue,
        digestIntervalMinutes: interval,
      },
      update: {
        enabled: dto.enabled,
        groupNames: dto.groupNames ? (dto.groupNames as Prisma.InputJsonValue) : undefined,
        digestIntervalMinutes: dto.digestIntervalMinutes,
      },
      include: { project: true },
    });
  }

  async listMessages(projectIdentifier: string) {
    const project = await this.resolveProject(projectIdentifier);
    return this.prisma.wechatMessage.findMany({
      where: { projectId: project.id },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  async listDigests(projectIdentifier: string) {
    const project = await this.resolveProject(projectIdentifier);
    return this.prisma.wechatTaskDigest.findMany({
      where: { projectId: project.id },
      orderBy: { windowEnd: 'desc' },
      take: 50,
    });
  }

  async importMessages(projectIdentifier: string, dto: ImportWechatMessagesDto) {
    const project = await this.resolveProject(projectIdentifier);
    const setting = await this.prisma.wechatProjectSetting.findUnique({
      where: { projectId: project.id },
    });

    if (!setting?.enabled) {
      throw new BadRequestException('Wechat integration is not enabled for this project');
    }

    const allowedGroups = this.getSettingGroups(setting.groupNames);
    const accepted = dto.messages.filter((message) =>
      this.shouldAcceptMessage(message, allowedGroups),
    );

    for (const message of accepted) {
      await this.prisma.wechatMessage.upsert({
        where: { externalMessageId: message.externalMessageId },
        update: {
          projectId: project.id,
          settingId: setting.id,
          groupId: message.groupId,
          groupName: message.groupName,
          senderId: message.senderId,
          senderName: message.senderName,
          content: message.content,
          messageType: message.messageType,
          rawPayload: (message.rawPayload || message) as Prisma.InputJsonValue,
          receivedAt: message.receivedAt ? new Date(message.receivedAt) : undefined,
          status: WechatInboundMessageStatus.NEW,
        },
        create: {
          projectId: project.id,
          settingId: setting.id,
          externalMessageId: message.externalMessageId,
          groupId: message.groupId,
          groupName: message.groupName,
          senderId: message.senderId,
          senderName: message.senderName,
          content: message.content,
          messageType: message.messageType,
          rawPayload: (message.rawPayload || message) as Prisma.InputJsonValue,
          receivedAt: message.receivedAt ? new Date(message.receivedAt) : undefined,
        },
      });
    }

    if (accepted.length && !setting.nextDigestAt) {
      await this.prisma.wechatProjectSetting.update({
        where: { id: setting.id },
        data: {
          nextDigestAt: this.addMinutes(new Date(), setting.digestIntervalMinutes),
        },
      });
    }

    return {
      ok: true,
      accepted: accepted.length,
      ignored: dto.messages.length - accepted.length,
    };
  }

  async runDigestForProject(projectIdentifier: string, force = true) {
    const project = await this.resolveProject(projectIdentifier);
    const setting = await this.prisma.wechatProjectSetting.findUnique({
      where: { projectId: project.id },
      include: { project: true },
    });

    if (!setting?.enabled) {
      return { ok: false, reason: 'setting_disabled' };
    }

    if (!force && setting.nextDigestAt && setting.nextDigestAt > new Date()) {
      return { ok: true, skipped: true, reason: 'not_due' };
    }

    return this.generateDigest(setting);
  }

  async runDigestLoop() {
    const settings = await this.prisma.wechatProjectSetting.findMany({
      where: {
        enabled: true,
        nextDigestAt: {
          lte: new Date(),
        },
      },
      include: { project: true },
    });

    const results: unknown[] = [];
    for (const setting of settings) {
      results.push(await this.generateDigest(setting));
    }
    return results;
  }

  private async tickDigestLoop() {
    try {
      await this.runDigestLoop();
    } catch (error) {
      this.logger.warn(
        `Wechat digest loop failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async generateDigest(setting: {
    id: string;
    projectId: string;
    lastDigestAt: Date | null;
    digestIntervalMinutes: number;
    project: { id: string; name: string; createdById: string };
  }) {
    const windowStart = setting.lastDigestAt || this.startOfToday();
    const windowEnd = new Date();
    const messages = await this.prisma.wechatMessage.findMany({
      where: {
        projectId: setting.projectId,
        status: WechatInboundMessageStatus.NEW,
        receivedAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { receivedAt: 'asc' },
    });

    if (!messages.length) {
      await this.prisma.wechatProjectSetting.update({
        where: { id: setting.id },
        data: {
          lastDigestAt: windowEnd,
          nextDigestAt: null,
        },
      });
      return { ok: true, skipped: true, reason: 'no_messages' };
    }

    const tasks = this.extractTasks(messages);
    const createdTaskIds = tasks.length
      ? await this.createTasksFromDigest(setting.project, tasks)
      : [];

    const digest = await this.prisma.wechatTaskDigest.create({
      data: {
        projectId: setting.projectId,
        settingId: setting.id,
        windowStart,
        windowEnd,
        title: `${setting.project.name} 微信群任务整理`,
        summary: this.buildDigestSummary(messages.length, tasks),
        sourceMessages: messages.map((message) => ({
          messageId: message.externalMessageId,
          groupName: message.groupName,
          senderName: message.senderName,
          content: message.content,
          receivedAt: message.receivedAt,
        })) as Prisma.InputJsonValue,
        extractedTasks: tasks as Prisma.InputJsonValue,
        createdTaskIds: createdTaskIds as Prisma.InputJsonValue,
        status: tasks.length ? WechatDigestStatus.APPLIED : WechatDigestStatus.SKIPPED,
      },
    });

    await this.prisma.wechatMessage.updateMany({
      where: {
        id: {
          in: messages.map((message) => message.id),
        },
      },
      data: {
        status: WechatInboundMessageStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    await this.prisma.wechatProjectSetting.update({
      where: { id: setting.id },
      data: {
        lastDigestAt: windowEnd,
        nextDigestAt: null,
      },
    });

    return digest;
  }

  private extractTasks(
    messages: Array<{
      externalMessageId: string;
      groupName: string;
      senderName: string;
      content: string;
      receivedAt: Date;
    }>,
  ) {
    const seen = new Set<string>();
    const tasks: ExtractedWechatTask[] = [];

    for (const message of messages) {
      for (const line of this.splitCandidateLines(message.content)) {
        const task = this.extractTaskText(line);
        if (!task) {
          continue;
        }

        const key = `${message.groupName}|${message.senderName}|${this.normalizeTaskKey(task)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        tasks.push({
          groupName: message.groupName,
          senderName: message.senderName,
          task,
          title: this.compactTitle(`${message.groupName} - ${message.senderName} - ${task}`),
          sourceMessageId: message.externalMessageId,
          sourceMessageText: line,
          receivedAt: message.receivedAt.toISOString(),
        });
      }
    }

    return tasks;
  }

  private async createTasksFromDigest(
    project: { id: string; name: string; createdById: string },
    tasks: ExtractedWechatTask[],
  ) {
    const systemUser = await this.ensureSystemUser();
    const createdTaskIds: string[] = [];

    for (const item of tasks) {
      const task = await this.prisma.task.create({
        data: {
          projectId: project.id,
          title: item.title,
          description: [
            item.task,
            '',
            `来源：微信群「${item.groupName}」`,
            `发送人：${item.senderName}`,
            `原文：${item.sourceMessageText}`,
          ].join('\n'),
          priority: this.inferPriority(item.task),
          status: 'PENDING_CONFIRMATION',
          createdById: systemUser.id || project.createdById,
          logs: {
            create: {
              action: TaskLogAction.CREATED,
              operatorId: systemUser.id,
              content: '由 Mac 微信群消息整理自动创建，等待确认',
              extraData: {
                source: 'wechat_import',
                sourceMessageId: item.sourceMessageId,
                groupName: item.groupName,
                senderName: item.senderName,
              },
            },
          },
        },
      });

      await this.prisma.event.create({
        data: {
          projectId: project.id,
          eventType: 'wechat_task',
          title: item.title,
          description: item.task,
          status: EventStatus.confirmed,
          confidence: 0.75,
          sourceType: EventSourceType.wechat_import,
          sourceChannel: item.groupName,
          sourceSender: item.senderName,
          sourceSenderRole: 'staff',
          rawContent: item.sourceMessageText,
          visibilityScope: VisibilityScope.admin,
          aiResult: {
            source: 'wechat_digest',
            sourceMessageId: item.sourceMessageId,
          },
          proposedChanges: {
            task: {
              id: task.id,
              title: item.title,
              description: item.task,
              priority: task.priority,
            },
          },
          createdById: systemUser.id,
          confirmedById: systemUser.id,
          confirmedAt: new Date(),
        },
      });

      createdTaskIds.push(task.id);
    }

    return createdTaskIds;
  }

  private shouldAcceptMessage(message: ImportWechatMessageDto, allowedGroups: string[]) {
    if (!message.content?.trim()) {
      return false;
    }

    if (!allowedGroups.length) {
      return true;
    }

    return allowedGroups.some(
      (group) => message.groupName.includes(group) || group.includes(message.groupName),
    );
  }

  private getSettingGroups(raw: Prisma.JsonValue | null) {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private splitCandidateLines(content: string) {
    return content
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private extractTaskText(line: string) {
    const cleaned = line
      .replace(/^[\-\*\d.、\s]+/, '')
      .replace(/^#?任务[:：\s]*/, '')
      .trim();

    if (!cleaned) {
      return null;
    }

    const hasTaskSignal =
      /^#?任务/.test(line) ||
      /(任务|待办|确认|安排|协调|对接|处理|推进|补充|跟进|提醒|同步|核对|提交|发送|准备|落实|排查|更新)/.test(
        cleaned,
      );

    if (!hasTaskSignal) {
      return null;
    }

    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
  }

  private normalizeTaskKey(text: string) {
    return text.replace(/\s+/g, '').replace(/[，。！？!?、:：]/g, '').slice(0, 50);
  }

  private compactTitle(text: string) {
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  private inferPriority(text: string) {
    if (/(紧急|马上|立即|尽快|今天必须|高优先|下班前|今晚)/.test(text)) {
      return TaskPriority.HIGH;
    }

    if (/(不急|低优先|有空)/.test(text)) {
      return TaskPriority.LOW;
    }

    return TaskPriority.MEDIUM;
  }

  private buildDigestSummary(messageCount: number, tasks: ExtractedWechatTask[]) {
    if (!tasks.length) {
      return `本次读取 ${messageCount} 条微信群消息，未识别到明确任务。`;
    }

    const preview = tasks
      .slice(0, 8)
      .map((task) => `- ${task.groupName} - ${task.senderName} - ${task.task}`)
      .join('\n');

    return `本次读取 ${messageCount} 条微信群消息，整理出 ${tasks.length} 个待确认任务。\n${preview}`;
  }

  private async ensureSystemUser() {
    return this.prisma.user.upsert({
      where: { email: 'system-wechat-ingest@golden.local' },
      update: {},
      create: {
        name: '微信群任务收集器',
        email: 'system-wechat-ingest@golden.local',
        remark: '用于 Mac 微信群消息整理与任务入库',
      },
    });
  }

  private async resolveProject(identifier: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private startOfToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60_000);
  }
}
