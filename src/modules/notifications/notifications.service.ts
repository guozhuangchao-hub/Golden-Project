import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ReminderInput = {
  projectId: string;
  taskId?: string | null;
  receiverId: string;
  senderId?: string | null;
  type: NotificationType;
  title: string;
  content: string;
  payload?: Prisma.InputJsonValue;
  cooldownHours?: number;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReminder(input: ReminderInput) {
    const cooldownHours = input.cooldownHours ?? 6;
    const duplicate = await this.prisma.notification.findFirst({
      where: {
        receiverId: input.receiverId,
        taskId: input.taskId ?? undefined,
        type: input.type,
        createdAt: {
          gte: new Date(Date.now() - cooldownHours * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (duplicate) {
      return { created: false, notification: duplicate };
    }

    const notification = await this.prisma.notification.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId ?? undefined,
        receiverId: input.receiverId,
        senderId: input.senderId ?? undefined,
        type: input.type,
        channel: NotificationChannel.MINI_PROGRAM,
        status: NotificationStatus.PENDING,
        title: input.title,
        content: input.content,
        payload: input.payload,
      },
    });

    if (input.taskId) {
      await this.prisma.task.update({
        where: { id: input.taskId },
        data: { lastReminderAt: new Date() },
      });
    }

    return { created: true, notification };
  }

  async listMemberNotifications(memberId: string, projectId?: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { id: memberId },
    });
    if (!member) {
      return [];
    }

    return this.prisma.notification.findMany({
      where: {
        receiverId: member.userId,
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

  async markAsRead(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  async dispatchPending(limit = 100) {
    const pending = await this.prisma.notification.findMany({
      where: { status: NotificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    if (!pending.length) {
      return { dispatched: 0 };
    }

    const ids = pending.map((item) => item.id);
    await this.prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });

    return { dispatched: ids.length };
  }

  async createOverdueTaskReminder(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        owner: true,
      },
    });

    if (!task?.ownerId) {
      return { created: false, reason: 'missing_owner' };
    }

    return this.createReminder({
      projectId: task.projectId,
      taskId: task.id,
      receiverId: task.ownerId,
      type: NotificationType.TASK_OVERDUE,
      title: '任务已逾期',
      content: `${task.project.name}：${task.title} 已逾期，请尽快反馈进展`,
      payload: {
        taskId: task.id,
        projectCode: task.project.code,
        dueTime: task.dueTime?.toISOString() ?? null,
      },
      cooldownHours: 4,
    });
  }

  async createStaleTaskReminder(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        owner: true,
      },
    });

    if (!task?.ownerId) {
      return { created: false, reason: 'missing_owner' };
    }

    return this.createReminder({
      projectId: task.projectId,
      taskId: task.id,
      receiverId: task.ownerId,
      type: NotificationType.TASK_UPDATED,
      title: '请更新任务进度',
      content: `${task.project.name}：${task.title} 还没有最近反馈，请更新进度或说明阻塞`,
      payload: {
        taskId: task.id,
        projectCode: task.project.code,
      },
      cooldownHours: 8,
    });
  }

  async summarizeMemberLoad(projectId: string) {
    const tasks = await this.prisma.task.findMany({
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
}
