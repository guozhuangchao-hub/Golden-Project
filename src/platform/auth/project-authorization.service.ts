import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionAction, RequestActor } from './request-actor.types';

type AuthorizationContext = {
  projectId: string | null;
  actorUserId: string | null;
  actorProjectMemberId: string | null;
  actorProjectRole: MemberRole | null;
  resourceId: string | null;
};

@Injectable()
export class ProjectAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  private isPrivilegedSystemRole(actor: RequestActor) {
    return actor.systemRole === 'SYSTEM_ADMIN' || actor.systemRole === 'SERVICE';
  }

  private async resolveProjectId(params: {
    projectIdentifier?: string | null;
    taskId?: string | null;
    eventId?: string | null;
  }) {
    if (params.projectIdentifier) {
      const project = await this.prisma.project.findFirst({
        where: {
          OR: [{ id: params.projectIdentifier }, { code: params.projectIdentifier }],
        },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }
      return { projectId: project.id, resourceId: project.id };
    }

    if (params.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: params.taskId },
        select: {
          id: true,
          projectId: true,
          ownerMemberId: true,
          assistantMemberId: true,
        },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }
      return {
        projectId: task.projectId,
        resourceId: task.id,
        ownerMemberId: task.ownerMemberId,
        assistantMemberId: task.assistantMemberId,
      };
    }

    if (params.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: params.eventId },
        select: { id: true, projectId: true },
      });
      if (!event) {
        throw new NotFoundException('Event not found');
      }
      return { projectId: event.projectId, resourceId: event.id };
    }

    return { projectId: null, resourceId: null };
  }

  async buildAuthorizationContext(params: {
    actor: RequestActor;
    projectIdentifier?: string | null;
    taskId?: string | null;
    eventId?: string | null;
  }): Promise<AuthorizationContext> {
    const resolved = await this.resolveProjectId(params);

    if (this.isPrivilegedSystemRole(params.actor)) {
      return {
        projectId: resolved.projectId,
        actorUserId: params.actor.userId || null,
        actorProjectMemberId: null,
        actorProjectRole: null,
        resourceId: resolved.resourceId,
      };
    }

    if (!params.actor.userId) {
      throw new UnauthorizedException('Missing actor identity');
    }

    if (!resolved.projectId) {
      throw new ForbiddenException('Project context required');
    }

    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId: resolved.projectId,
        userId: params.actor.userId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!member) {
      throw new ForbiddenException('Actor is not an active project member');
    }

    return {
      projectId: resolved.projectId,
      actorUserId: params.actor.userId,
      actorProjectMemberId: member.id,
      actorProjectRole: member.role,
      resourceId: resolved.resourceId,
    };
  }

  async assertAuthorized(params: {
    actor: RequestActor;
    action: PermissionAction;
    projectIdentifier?: string | null;
    taskId?: string | null;
    eventId?: string | null;
  }) {
    const context = await this.buildAuthorizationContext(params);

    if (this.isPrivilegedSystemRole(params.actor)) {
      return context;
    }

    const role = context.actorProjectRole;
    const isAdmin = role === MemberRole.ADMIN;
    const isLeader = role === MemberRole.LEADER;

    switch (params.action) {
      case 'PROJECT_DELETE':
        if (!isAdmin) {
          throw new ForbiddenException('Only project admins can delete a project');
        }
        break;
      case 'PROJECT_STRUCTURE_WRITE':
      case 'PROJECT_RUNTIME_WRITE':
      case 'PROJECT_FILE_READ':
      case 'AGENT_WORKFLOW_TRIGGER':
      case 'EVENT_REVIEW':
      case 'TASK_ADMIN_WRITE':
        if (!isAdmin && !isLeader) {
          throw new ForbiddenException('Only project admins or leaders can perform this action');
        }
        break;
      case 'TASK_MEMBER_WRITE': {
        if (isAdmin || isLeader) {
          break;
        }
        if (!params.taskId) {
          throw new ForbiddenException('Task context required');
        }
        const task = await this.prisma.task.findUnique({
          where: { id: params.taskId },
          select: {
            ownerMemberId: true,
            assistantMemberId: true,
          },
        });
        if (!task) {
          throw new NotFoundException('Task not found');
        }
        if (
          task.ownerMemberId !== context.actorProjectMemberId &&
          task.assistantMemberId !== context.actorProjectMemberId
        ) {
          throw new ForbiddenException(
            'Only project admins, leaders, or assigned members can update this task',
          );
        }
        break;
      }
      default:
        throw new ForbiddenException('Unsupported permission action');
    }

    return context;
  }
}
