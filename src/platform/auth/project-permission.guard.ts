import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { PROJECT_PERMISSION_KEY } from './permission.decorator';
import { ProjectAuthorizationService } from './project-authorization.service';
import { extractRequestActor } from './request-actor.util';
import { PermissionMetadata } from './request-actor.types';

@Injectable()
export class ProjectPermissionGuard implements CanActivate {
  constructor(
    private readonly auditService: AuditService,
    private readonly authorizationService: ProjectAuthorizationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const metadata = this.reflector.get<PermissionMetadata>(
      PROJECT_PERMISSION_KEY,
      context.getHandler(),
    );

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & Record<string, any>>();
    const actor = extractRequestActor(request);

    if (!actor.systemRole && !actor.userId) {
      await this.auditService.record({
        projectId: null,
        actorUserId: null,
        actorProjectMemberId: null,
        actorSystemRole: null,
        action: metadata.action,
        resourceType: this.resolveResourceType(metadata),
        resourceId: this.resolveResourceId(request.params, metadata),
        status: 'DENIED',
        summary: 'Missing actor identity',
        details: {
          path: request.url,
          params: request.params,
        },
      });
      throw new UnauthorizedException('Missing actor identity');
    }

    try {
      const authorization = await this.authorizationService.assertAuthorized({
        actor,
        action: metadata.action,
        projectIdentifier: metadata.projectParam
          ? String(request.params[metadata.projectParam] ?? '')
          : undefined,
        taskId: metadata.taskParam ? String(request.params[metadata.taskParam] ?? '') : undefined,
        eventId: metadata.eventParam
          ? String(request.params[metadata.eventParam] ?? '')
          : undefined,
      });

      request.actor = actor;
      request.authorization = authorization;
      return true;
    } catch (error) {
      await this.auditService.record({
        projectId: null,
        actorUserId: actor.userId || null,
        actorProjectMemberId: null,
        actorSystemRole: actor.systemRole || null,
        action: metadata.action,
        resourceType: this.resolveResourceType(metadata),
        resourceId: this.resolveResourceId(request.params, metadata),
        status: 'DENIED',
        summary: error instanceof Error ? error.message : 'Permission denied',
        details: {
          path: request.url,
          params: request.params,
        },
      });
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException(
        error instanceof Error ? error.message : 'Permission denied',
      );
    }
  }

  private resolveResourceType(metadata: PermissionMetadata) {
    if (metadata.taskParam) {
      return 'task';
    }
    if (metadata.eventParam) {
      return 'event';
    }
    return 'project';
  }

  private resolveResourceId(
    params: Record<string, string | string[] | undefined>,
    metadata: PermissionMetadata,
  ) {
    const pick = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] || null : value || null;

    if (metadata.resourceIdParam) {
      return pick(params[metadata.resourceIdParam]);
    }
    if (metadata.taskParam) {
      return pick(params[metadata.taskParam]);
    }
    if (metadata.eventParam) {
      return pick(params[metadata.eventParam]);
    }
    if (metadata.projectParam) {
      return pick(params[metadata.projectParam]);
    }
    return null;
  }
}
