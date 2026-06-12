import { applyDecorators, SetMetadata, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuditActionInterceptor } from '../audit/audit-action.interceptor';
import { AUDIT_PERMISSION_KEY } from '../audit/audit.constants';
import { ProjectPermissionGuard } from './project-permission.guard';
import { PermissionMetadata } from './request-actor.types';

export const PROJECT_PERMISSION_KEY = 'project_permission';

export function RequireProjectPermission(metadata: PermissionMetadata) {
  return applyDecorators(
    SetMetadata(PROJECT_PERMISSION_KEY, metadata),
    SetMetadata(AUDIT_PERMISSION_KEY, metadata),
    UseGuards(ProjectPermissionGuard),
    UseInterceptors(AuditActionInterceptor),
  );
}
