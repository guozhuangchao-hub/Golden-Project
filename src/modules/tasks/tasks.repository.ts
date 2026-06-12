import { Injectable } from '@nestjs/common';
import {
  EventSourceType,
  EventStatus,
  Prisma,
  TaskLogAction,
  TaskPriority,
  TaskStatus,
  TaskUpdateType,
  VisibilityScope,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectWithMembersAndModules(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
        },
        members: {
          where: { status: 'ACTIVE' },
          include: { user: true },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        },
      },
    });
  }

  upsertSystemUser() {
    return this.prisma.user.upsert({
      where: { email: 'system-task-publisher@golden.local' },
      update: {},
      create: {
        name: '任务发布系统',
        email: 'system-task-publisher@golden.local',
        remark: '用于后台 AI 任务发布与小程序通知',
      },
    });
  }

  createTaskEvent(params: {
    projectId: string;
    taskId: string;
    title: string;
    description?: string | null;
    moduleName?: string | null;
    ownerName?: string | null;
    priority?: TaskPriority;
    dueTime?: Date | string | null;
    systemUserId: string;
    sourceChannel: string;
    rawText?: string | null;
    recipientMode?: string | null;
  }) {
    return this.prisma.event.create({
      data: {
        projectId: params.projectId,
        eventType: 'task_publish',
        title: params.title,
        description: params.description || params.rawText || '后台发布任务已生成正式任务。',
        status: EventStatus.confirmed,
        confidence: 1,
        sourceType: EventSourceType.manual,
        sourceChannel: params.sourceChannel,
        sourceSender: '任务发布',
        sourceSenderRole: 'admin',
        rawContent: params.rawText || params.description || params.title,
        visibilityScope: VisibilityScope.admin,
        aiResult: {
          source: params.sourceChannel,
          taskId: params.taskId,
          recipientMode: params.recipientMode,
        },
        proposedChanges: {
          task: {
            id: params.taskId,
            title: params.title,
            description: params.description,
            moduleName: params.moduleName,
            ownerName: params.ownerName,
            priority: params.priority,
            dueTime: params.dueTime ? new Date(params.dueTime).toISOString() : undefined,
          },
        },
        createdById: params.systemUserId,
        confirmedById: params.systemUserId,
        confirmedAt: new Date(),
      },
    });
  }

  findProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  findProjectMemberById(memberId: string) {
    return this.prisma.projectMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
  }

  findProjectModuleByName(projectId: string, name: string) {
    return this.prisma.projectModule.findFirst({
      where: { projectId, name },
    });
  }

  createTask(data: { data: Prisma.TaskUncheckedCreateInput }) {
    return this.prisma.task.create({
      data: data.data,
      include: {
        owner: true,
        assistant: true,
        module: true,
        ownerMember: true,
        assistantMember: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  createNotifications(data: Prisma.NotificationCreateManyInput[]) {
    return this.prisma.notification.createMany({ data });
  }

  findTasks(projectId: string) {
    return this.prisma.task.findMany({
      where: { projectId },
      include: {
        owner: true,
        assistant: true,
        module: true,
      },
      orderBy: [{ dueTime: 'asc' }, { createdAt: 'desc' }],
    });
  }

  findTaskDetail(taskId: string) {
    return this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        owner: true,
        assistant: true,
        module: true,
        ownerMember: true,
        assistantMember: true,
        project: true,
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  findTaskUpdates(taskId: string) {
    return this.prisma.taskUpdate.findMany({
      where: { taskId },
      include: {
        member: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateTaskStatus(
    taskId: string,
    params: {
      currentStatus: TaskStatus;
      toStatus: TaskStatus;
      content?: string;
    },
  ) {
    const completedAt = params.toStatus === TaskStatus.COMPLETED ? new Date() : undefined;
    const confirmedAt = params.toStatus === TaskStatus.CONFIRMED ? new Date() : undefined;
    const cancelledAt = params.toStatus === TaskStatus.CANCELLED ? new Date() : undefined;

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: params.toStatus,
        completedAt,
        confirmedAt,
        cancelledAt,
        logs: {
          create: {
            action:
              params.toStatus === TaskStatus.CONFIRMED
                ? TaskLogAction.CONFIRMED
                : params.toStatus === TaskStatus.COMPLETED
                  ? TaskLogAction.COMPLETED
                  : params.toStatus === TaskStatus.CANCELLED
                    ? TaskLogAction.CANCELLED
                    : TaskLogAction.STATUS_CHANGED,
            fromStatus: params.currentStatus,
            toStatus: params.toStatus,
            content: params.content,
          },
        },
      },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  createTaskUpdate(data: { data: Prisma.TaskUpdateUncheckedCreateInput }) {
    return this.prisma.taskUpdate.create({
      data: data.data,
      include: {
        member: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  updateTaskAfterProgress(params: {
    taskId: string;
    memberUserId?: string | null;
    type: TaskUpdateType;
    content: string;
    progressPercent?: number | null;
  }) {
    return this.prisma.task.update({
      where: { id: params.taskId },
      data: {
        lastProgressAt:
          params.type === TaskUpdateType.PROGRESS ? new Date() : undefined,
        blockedAt:
          params.type === TaskUpdateType.BLOCKER || params.type === TaskUpdateType.HELP_REQUEST
            ? new Date()
            : params.type === TaskUpdateType.PROGRESS
              ? null
              : undefined,
        needsHelp:
          params.type === TaskUpdateType.BLOCKER || params.type === TaskUpdateType.HELP_REQUEST
            ? true
            : params.type === TaskUpdateType.PROGRESS
              ? false
              : undefined,
        logs: {
          create: {
            action: TaskLogAction.COMMENTED,
            operatorId: params.memberUserId || undefined,
            content: params.content,
            extraData: {
              updateType: params.type,
              progressPercent: params.progressPercent ?? undefined,
            },
          },
        },
      },
    });
  }
}
