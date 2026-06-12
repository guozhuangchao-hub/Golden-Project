import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDuplicateReminder(params: {
    receiverId: string;
    taskId?: string | null;
    type: NotificationType;
    cooldownHours: number;
  }) {
    return this.prisma.notification.findFirst({
      where: {
        receiverId: params.receiverId,
        taskId: params.taskId ?? undefined,
        type: params.type,
        createdAt: {
          gte: new Date(Date.now() - params.cooldownHours * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createReminder(data: Prisma.NotificationCreateInput) {
    return this.prisma.notification.create({ data });
  }

  touchTaskReminder(taskId: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { lastReminderAt: new Date() },
    });
  }

  findProjectMember(memberId: string) {
    return this.prisma.projectMember.findUnique({
      where: { id: memberId },
    });
  }

  findMemberNotifications(userId: string, projectId?: string) {
    return this.prisma.notification.findMany({
      where: {
        receiverId: userId,
        ...(projectId ? { projectId } : {}),
      },
      include: {
        task: {
          include: {
            module: true,
            owner: true,
          },
        },
        project: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  markNotificationRead(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  findPendingNotifications(limit: number) {
    return this.prisma.notification.findMany({
      where: { status: NotificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  markNotificationsSent(ids: string[]) {
    return this.prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });
  }

  findTaskWithProjectAndOwner(taskId: string) {
    return this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        owner: true,
      },
    });
  }

  findActiveTaskLoad(projectId: string) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        status: {
          in: [TaskStatus.PENDING_CONFIRMATION, TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
        },
      },
      include: {
        owner: true,
      },
    });
  }
}
