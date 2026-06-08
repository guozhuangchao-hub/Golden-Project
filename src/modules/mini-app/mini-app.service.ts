import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskUpdateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentsService } from '../integrations/agents/agents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from '../tasks/tasks.service';
import { ConfirmMiniTaskDto } from './dto/confirm-mini-task.dto';
import { CreateHelpRequestDto } from './dto/create-help-request.dto';
import { CreateProgressUpdateDto } from './dto/create-progress-update.dto';

@Injectable()
export class MiniAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly notificationsService: NotificationsService,
    private readonly agentsService: AgentsService,
  ) {}

  async getMyTasks(memberId: string, projectId?: string) {
    const member = await this.resolveMember(memberId);
    return this.prisma.task.findMany({
      where: {
        ...(projectId ? { projectId } : { projectId: member.projectId }),
        OR: [{ ownerMemberId: member.id }, { assistantMemberId: member.id }],
      },
      include: {
        module: true,
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: [{ dueTime: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getMyReminders(memberId: string, projectId?: string) {
    return this.notificationsService.listMemberNotifications(memberId, projectId);
  }

  async getProjectBrief(projectCode: string, memberId?: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: projectCode }, { code: projectCode }],
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

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const member = memberId ? await this.resolveMember(memberId) : null;
    const tasks = member
      ? await this.prisma.task.findMany({
          where: {
            projectId: project.id,
            OR: [{ ownerMemberId: member.id }, { assistantMemberId: member.id }],
          },
          orderBy: [{ dueTime: 'asc' }, { createdAt: 'desc' }],
          take: 5,
        })
      : [];

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        description: project.description,
        location: project.location,
        status: project.status,
      },
      modules: project.modules.map((module) => ({
        id: module.id,
        name: module.name,
        description: module.description,
      })),
      contacts: project.members.slice(0, 12).map((item) => ({
        memberId: item.id,
        name: item.user.name,
        role: item.role,
        title: item.title,
        mobile: item.user.mobile,
      })),
      myTasks: tasks,
    };
  }

  async getProjectContacts(projectCode: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: projectCode }, { code: projectCode }],
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.projectMember.findMany({
      where: {
        projectId: project.id,
        status: 'ACTIVE',
      },
      include: {
        user: true,
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  async confirmTask(taskId: string, dto: ConfirmMiniTaskDto) {
    return this.tasksService.changeStatus(taskId, { toStatus: 'CONFIRMED', content: dto.content }, 'CONFIRMED');
  }

  async updateProgress(taskId: string, dto: CreateProgressUpdateDto) {
    return this.tasksService.addUpdate(taskId, {
      memberId: dto.memberId,
      type: TaskUpdateType.PROGRESS,
      content: dto.content,
      progressPercent: dto.progressPercent,
    });
  }

  async askHelp(taskId: string, dto: CreateHelpRequestDto) {
    const update = await this.tasksService.addUpdate(taskId, {
      memberId: dto.memberId,
      type: TaskUpdateType.HELP_REQUEST,
      content: dto.content,
    });

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        module: true,
        ownerMember: {
          include: { user: true },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const advice = await this.agentsService.chat(task.projectId, {
      provider: dto.provider ?? 'codex',
      sessionId: `mini-help-${taskId}`,
      includeProjectContext: true,
      message: [
        `任务标题：${task.title}`,
        `模块：${task.module?.name ?? '项目级任务'}`,
        `负责人：${task.ownerMember?.user?.name ?? '待指定'}`,
        `求助内容：${dto.content}`,
        '请给出简洁可执行的下一步建议，优先回答先做什么、找谁、还缺什么信息。',
      ].join('\n'),
    });

    return {
      update,
      advice,
    };
  }

  async markReminderRead(notificationId: string) {
    return this.notificationsService.markAsRead(notificationId);
  }

  private async resolveMember(memberId: string) {
    if (!memberId) {
      throw new BadRequestException('memberId is required');
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!member) {
      throw new NotFoundException('Project member not found');
    }
    return member;
  }
}
