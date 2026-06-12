import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { AUDIT_PERMISSION_KEY } from './audit.constants';
import { AuditService } from './audit.service';
import { PermissionMetadata } from '../auth/request-actor.types';

@Injectable()
export class AuditActionInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const metadata = this.reflector.get<PermissionMetadata>(
      AUDIT_PERMISSION_KEY,
      context.getHandler(),
    );

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & Record<string, any>>();
    const actor = request.actor;
    const authorization = request.authorization;
    const resourceType = this.resolveResourceType(metadata);
    const resourceId = this.resolveResourceId(request.params, metadata);

    return next.handle().pipe(
      mergeMap((data) =>
        from(
          this.auditService.record({
            projectId: authorization?.projectId || null,
            actorUserId: authorization?.actorUserId || actor?.userId || null,
            actorProjectMemberId: authorization?.actorProjectMemberId || null,
            actorSystemRole: actor?.systemRole || null,
            action: metadata.action,
            resourceType,
            resourceId,
            status: 'SUCCESS',
            summary: `${metadata.action} succeeded`,
            details: {
              path: request.url,
              params: request.params,
            },
          }),
        ).pipe(mergeMap(() => from(Promise.resolve(data)))),
      ),
      catchError((error) =>
        from(
          this.auditService.record({
            projectId: authorization?.projectId || null,
            actorUserId: authorization?.actorUserId || actor?.userId || null,
            actorProjectMemberId: authorization?.actorProjectMemberId || null,
            actorSystemRole: actor?.systemRole || null,
            action: metadata.action,
            resourceType,
            resourceId,
            status: 'FAILED',
            summary: error instanceof Error ? error.message : 'Action failed',
            details: {
              path: request.url,
              params: request.params,
            },
          }),
        ).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
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
