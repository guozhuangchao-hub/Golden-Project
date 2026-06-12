import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TaskUpdateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IdentityClaimsState,
  StructureTreeNode,
  StructureTreeState,
} from '../projects/project-runtime-state.types';
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

  async getMyTasks(memberId?: string, projectId?: string, nodeId?: string) {
    const member = await this.resolveIdentityMember(projectId, memberId, nodeId);
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
    const runtimeState = await this.prisma.projectRuntimeState.findUnique({
      where: { projectId: project.id },
    });
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
      runtimeState,
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

  async getIdentityPool(projectCode: string, memberId?: string) {
    const project = await this.resolveProject(projectCode);
    const runtimeState = await this.prisma.projectRuntimeState.findUnique({
      where: { projectId: project.id },
    });
    const tree = this.getStructureTree(runtimeState?.structureTree);
    const claims = this.getIdentityClaims(runtimeState?.identityClaims);

    const nodes = tree.length
      ? tree
          .filter((node) => node.parentId !== null)
          .filter((node) => !tree.some((child) => child.parentId === node.id))
          .filter((node) => node.data?.claimable)
          .map((node) => ({
            nodeId: node.id,
            name: node.name,
            parentName: this.findParentName(tree, node.parentId),
            taskName: node.data?.taskName || '',
            assignedMemberId: node.data?.assignedMemberId || '',
            assignedMemberName: node.data?.assignedMemberName || '',
            selected: memberId ? node.data?.assignedMemberId === memberId : false,
          }))
      : project.modules.map((module) => {
          const claim = claims[`module_${module.id}`] || {};
          return {
            nodeId: `module_${module.id}`,
            name: module.name,
            parentName: '项目模块',
            taskName: module.description || '',
            assignedMemberId: claim.memberId || '',
            assignedMemberName: claim.memberName || '',
            selected: memberId ? claim.memberId === memberId : false,
          };
        });

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      nodes,
    };
  }

  async claimIdentity(projectCode: string, memberId: string, nodeId: string) {
    if (!memberId || !nodeId) {
      throw new BadRequestException('memberId and nodeId are required');
    }

    const project = await this.resolveProject(projectCode);
    const member = await this.resolveMember(memberId);
    if (member.projectId !== project.id) {
      throw new BadRequestException('Project member does not belong to this project');
    }

    const runtimeState = await this.prisma.projectRuntimeState.findUnique({
      where: { projectId: project.id },
    });
    const tree = this.getStructureTree(runtimeState?.structureTree);
    const claims = this.getIdentityClaims(runtimeState?.identityClaims);

    if (tree.length) {
      for (const item of tree) {
        if (item.data?.assignedMemberId === memberId && item.id !== nodeId) {
          item.data.assignedMemberId = '';
          item.data.assignedMemberName = '';
        }
      }
      const target = tree.find((item) => item.id === nodeId);
      if (!target) {
        throw new NotFoundException('Identity node not found');
      }
      target.data = target.data || {};
      target.data.assignedMemberId = memberId;
      target.data.assignedMemberName = member.user.name;
      await this.prisma.projectRuntimeState.upsert({
        where: { projectId: project.id },
        update: {
          structureTree: tree as Prisma.InputJsonValue,
        },
        create: {
          projectId: project.id,
          structureTree: tree as Prisma.InputJsonValue,
        },
      });
      return { ok: true, projectId: project.id, nodeId, memberId, memberName: member.user.name };
    }

    Object.keys(claims).forEach((key) => {
      if (claims[key]?.memberId === memberId && key !== nodeId) {
        delete claims[key];
      }
    });
    claims[nodeId] = { memberId, memberName: member.user.name };
    await this.prisma.projectRuntimeState.upsert({
      where: { projectId: project.id },
      update: {
        identityClaims: claims as Prisma.InputJsonValue,
      },
      create: {
        projectId: project.id,
        identityClaims: claims as Prisma.InputJsonValue,
      },
    });
    return { ok: true, projectId: project.id, nodeId, memberId, memberName: member.user.name };
  }

  async releaseIdentity(projectCode: string, nodeId: string, memberId?: string) {
    if (!nodeId) {
      throw new BadRequestException('nodeId is required');
    }

    const project = await this.resolveProject(projectCode);
    const runtimeState = await this.prisma.projectRuntimeState.findUnique({
      where: { projectId: project.id },
    });
    const tree = this.getStructureTree(runtimeState?.structureTree);
    const claims = this.getIdentityClaims(runtimeState?.identityClaims);

    if (tree.length) {
      const target = tree.find((item) => item.id === nodeId);
      if (!target) {
        throw new NotFoundException('Identity node not found');
      }
      if (!memberId || target.data?.assignedMemberId === memberId) {
        target.data = target.data || {};
        target.data.assignedMemberId = '';
        target.data.assignedMemberName = '';
      }
      await this.prisma.projectRuntimeState.upsert({
        where: { projectId: project.id },
        update: {
          structureTree: tree as Prisma.InputJsonValue,
        },
        create: {
          projectId: project.id,
          structureTree: tree as Prisma.InputJsonValue,
        },
      });
      return { ok: true, projectId: project.id, nodeId };
    }

    delete claims[nodeId];
    await this.prisma.projectRuntimeState.upsert({
      where: { projectId: project.id },
      update: {
        identityClaims: claims as Prisma.InputJsonValue,
      },
      create: {
        projectId: project.id,
        identityClaims: claims as Prisma.InputJsonValue,
      },
    });
    return { ok: true, projectId: project.id, nodeId };
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

  private async resolveProject(projectCode: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: projectCode }, { code: projectCode }],
      },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private getStructureTree(structureTree: unknown): StructureTreeNode[] {
    if (
      structureTree &&
      typeof structureTree === 'object' &&
      Array.isArray((structureTree as StructureTreeState).tree)
    ) {
      return (structureTree as StructureTreeState).tree;
    }
    return [];
  }

  private getIdentityClaims(identityClaims: unknown): IdentityClaimsState {
    if (identityClaims && typeof identityClaims === 'object' && !Array.isArray(identityClaims)) {
      return { ...(identityClaims as IdentityClaimsState) };
    }
    return {};
  }

  private findParentName(tree: StructureTreeNode[], parentId: string | null) {
    if (!parentId) return '';
    const parent = tree.find((node) => node.id === parentId);
    return parent?.name || '';
  }

  private async resolveIdentityMember(projectId?: string, memberId?: string, nodeId?: string) {
    if (memberId) {
      return this.resolveMember(memberId);
    }
    if (!projectId || !nodeId) {
      throw new BadRequestException('memberId or nodeId is required');
    }

    const runtimeState = await this.prisma.projectRuntimeState.findUnique({
      where: { projectId },
    });
    const tree = this.getStructureTree(runtimeState?.structureTree);
    const claims = this.getIdentityClaims(runtimeState?.identityClaims);

    let resolvedMemberId = '';
    if (tree.length) {
      const target = tree.find((node) => node.id === nodeId);
      resolvedMemberId = target?.data?.assignedMemberId || '';
    }
    if (!resolvedMemberId) {
      resolvedMemberId = claims[nodeId]?.memberId || '';
    }
    if (!resolvedMemberId) {
      throw new NotFoundException('Identity node is not claimed yet');
    }
    return this.resolveMember(resolvedMemberId);
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
