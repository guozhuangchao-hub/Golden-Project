import { Injectable } from '@nestjs/common';
import {
  EventSourceType,
  Prisma,
  WechatDigestStatus,
  WechatInboundMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ImportWechatMessageDto,
  ImportWechatMessagesDto,
} from './dto/import-wechat-messages.dto';

@Injectable()
export class WechatRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  findProjectSetting(projectId: string) {
    return this.prisma.wechatProjectSetting.findUnique({
      where: { projectId },
      include: { project: true },
    });
  }

  upsertProjectSetting(
    projectId: string,
    data: {
      enabled?: boolean;
      groupNames?: string[];
      digestIntervalMinutes?: number;
    },
  ) {
    const interval = data.digestIntervalMinutes ?? 10;
    return this.prisma.wechatProjectSetting.upsert({
      where: { projectId },
      create: {
        projectId,
        enabled: data.enabled ?? true,
        groupNames: (data.groupNames || []) as Prisma.InputJsonValue,
        digestIntervalMinutes: interval,
      },
      update: {
        enabled: data.enabled,
        groupNames: data.groupNames ? (data.groupNames as Prisma.InputJsonValue) : undefined,
        digestIntervalMinutes: data.digestIntervalMinutes,
      },
      include: { project: true },
    });
  }

  findMessages(projectId: string) {
    return this.prisma.wechatMessage.findMany({
      where: { projectId },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  findDigests(projectId: string) {
    return this.prisma.wechatTaskDigest.findMany({
      where: { projectId },
      orderBy: { windowEnd: 'desc' },
      take: 50,
    });
  }

  upsertWechatMessage(projectId: string, settingId: string, message: ImportWechatMessageDto) {
    return this.prisma.wechatMessage.upsert({
      where: { externalMessageId: message.externalMessageId },
      update: {
        projectId,
        settingId,
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
        projectId,
        settingId,
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

  scheduleNextDigest(settingId: string, nextDigestAt: Date) {
    return this.prisma.wechatProjectSetting.update({
      where: { id: settingId },
      data: {
        nextDigestAt,
      },
    });
  }

  findDueDigestSettings() {
    return this.prisma.wechatProjectSetting.findMany({
      where: {
        enabled: true,
        nextDigestAt: {
          lte: new Date(),
        },
      },
      include: { project: true },
    });
  }

  findWindowMessages(projectId: string, windowStart: Date, windowEnd: Date) {
    return this.prisma.wechatMessage.findMany({
      where: {
        projectId,
        status: WechatInboundMessageStatus.NEW,
        receivedAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { receivedAt: 'asc' },
    });
  }

  createDigest(data: Prisma.WechatTaskDigestCreateInput) {
    return this.prisma.wechatTaskDigest.create({ data });
  }

  markMessagesProcessed(ids: string[]) {
    return this.prisma.wechatMessage.updateMany({
      where: { id: { in: ids } },
      data: {
        status: WechatInboundMessageStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
  }

  finalizeDigestSetting(settingId: string, lastDigestAt: Date) {
    return this.prisma.wechatProjectSetting.update({
      where: { id: settingId },
      data: {
        lastDigestAt,
        nextDigestAt: null,
      },
    });
  }

  upsertSystemUser() {
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
}
