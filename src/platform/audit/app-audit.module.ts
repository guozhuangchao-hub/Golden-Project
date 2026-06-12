import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditActionInterceptor } from './audit-action.interceptor';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [Reflector, AuditService, AuditActionInterceptor],
  exports: [AuditService, AuditActionInterceptor],
})
export class AppAuditModule {}
