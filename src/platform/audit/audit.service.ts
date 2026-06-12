import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type AuditRecordInput = {
  projectId: string | null;
  actorUserId: string | null;
  actorProjectMemberId: string | null;
  actorSystemRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  status: 'SUCCESS' | 'DENIED' | 'FAILED';
  summary: string;
  details?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput) {
    return this.prisma.auditLog.create({
      data: {
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        actorProjectMemberId: input.actorProjectMemberId,
        actorSystemRole: input.actorSystemRole,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        status: input.status,
        summary: input.summary,
        details: (input.details || undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
