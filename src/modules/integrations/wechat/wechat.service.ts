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
  Prisma,
  WechatDigestStatus,
  WechatInboundMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpsSignalsService } from '../../ops-signals/ops-signals.service';
import {
  ImportWechatMessageDto,
  ImportWechatMessagesDto,
} from './dto/import-wechat-messages.dto';
import { UpsertWechatSettingDto } from './dto/upsert-wechat-setting.dto';

@Injectable()
export class WechatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WechatService.name);
  private digestTimer?: NodeJS.Timeout;

  constructor(
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

    const systemUser = await this.ensureSystemUser();
    const signals = this.opsSignalsService.extractSignals(
      messages.map((message) => ({
        sourceMessageId: message.externalMessageId,
        sourceChannel: message.groupName,
        senderName: message.senderName,
        content: message.content,
        receivedAt: message.receivedAt,
      })),
      {
        projectId: setting.projectId,
        sourceType: EventSourceType.wechat_import,
      },
    );
    await this.opsSignalsService.persistSignals(
      {
        projectId: setting.projectId,
        sourceType: EventSourceType.wechat_import,
      },
      signals,
    );
    const createdEventIds = signals.length
      ? await this.opsSignalsService.createPendingEventsFromSignals({
          projectId: setting.projectId,
          sourceType: EventSourceType.wechat_import,
          systemUserId: systemUser.id || setting.project.createdById,
          signals,
        })
      : [];
    const taskCandidates = this.opsSignalsService.taskCandidatesFromSignals(signals);

    const digest = await this.prisma.wechatTaskDigest.create({
      data: {
        projectId: setting.projectId,
        settingId: setting.id,
        windowStart,
        windowEnd,
        title: `${setting.project.name} 微信群任务整理`,
        summary: this.buildDigestSummary(setting.project.name, messages.length, signals),
        sourceMessages: messages.map((message) => ({
          messageId: message.externalMessageId,
          groupName: message.groupName,
          senderName: message.senderName,
          content: message.content,
          receivedAt: message.receivedAt,
        })) as Prisma.InputJsonValue,
        extractedTasks: taskCandidates as Prisma.InputJsonValue,
        createdTaskIds: createdEventIds as Prisma.InputJsonValue,
        status: signals.length ? WechatDigestStatus.APPLIED : WechatDigestStatus.SKIPPED,
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

  private buildDigestSummary(
    projectName: string,
    messageCount: number,
    signals: ReturnType<OpsSignalsService['extractSignals']>,
  ) {
    if (!signals.length) {
      return `本次读取 ${messageCount} 条微信群消息，未识别到明确任务、风险或求助信号。`;
    }

    const preview = signals
      .slice(0, 8)
      .map((signal) => `- [${signal.signalType}] ${signal.summary}`)
      .join('\n');

    return `${this.opsSignalsService.buildSignalSummary(projectName, messageCount, signals)}\n${preview}`;
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
