import { Injectable } from '@nestjs/common';
import { TaskLogAction, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateTaskDto) {
    const ownerMember = dto.ownerMemberId
      ? await this.prisma.projectMember.findUnique({
          where: { id: dto.ownerMemberId },
          include: { user: true },
        })
      : null;

    const assistantMember = dto.assistantMemberId
      ? await this.prisma.projectMember.findUnique({
          where: { id: dto.assistantMemberId },
          include: { user: true },
        })
      : null;

    return this.prisma.task.create({
      data: {
        projectId,
        moduleId: dto.moduleId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        ownerId: ownerMember?.userId,
        ownerMemberId: ownerMember?.id,
        assistantId: assistantMember?.userId,
        assistantMemberId: assistantMember?.id,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        dueTime: dto.dueTime ? new Date(dto.dueTime) : undefined,
        createdById: 'SYSTEM_SEED_USER_ID',
        logs: {
          create: {
            action: TaskLogAction.CREATED,
            content: 'Task created',
          },
        },
      },
      include: {
        logs: true,
      },
    });
  }

  findAll(projectId: string) {
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

  findOne(taskId: string) {
    return this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        owner: true,
        assistant: true,
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async changeStatus(
    taskId: string,
    dto: UpdateTaskStatusDto,
    toStatus: TaskStatus,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return null;
    }

    const completedAt = toStatus === TaskStatus.COMPLETED ? new Date() : undefined;
    const confirmedAt = toStatus === TaskStatus.CONFIRMED ? new Date() : undefined;
    const cancelledAt = toStatus === TaskStatus.CANCELLED ? new Date() : undefined;

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: toStatus,
        completedAt,
        confirmedAt,
        cancelledAt,
        logs: {
          create: {
            action:
              toStatus === TaskStatus.CONFIRMED
                ? TaskLogAction.CONFIRMED
                : toStatus === TaskStatus.COMPLETED
                  ? TaskLogAction.COMPLETED
                  : toStatus === TaskStatus.CANCELLED
                    ? TaskLogAction.CANCELLED
                    : TaskLogAction.STATUS_CHANGED,
            fromStatus: task.status,
            toStatus,
            content: dto.content,
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
}
