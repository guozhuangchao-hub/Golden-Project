import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { AppAuditModule } from '../audit/app-audit.module';
import { ProjectAuthorizationService } from './project-authorization.service';
import { ProjectPermissionGuard } from './project-permission.guard';

@Global()
@Module({
  imports: [PrismaModule, AppAuditModule],
  providers: [Reflector, ProjectAuthorizationService, ProjectPermissionGuard],
  exports: [ProjectAuthorizationService, ProjectPermissionGuard],
})
export class AppAuthModule {}
