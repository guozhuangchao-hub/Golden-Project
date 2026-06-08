import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RiskSeverity, RiskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type UpsertRiskInput = {
  projectId: string;
  title: string;
  description?: string | null;
  severity: RiskSeverity;
  sourceKind: string;
  sourceRefId?: string | null;
  ownerMemberId?: string | null;
  payload?: Prisma.InputJsonValue;
};

@Injectable()
export class RisksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectIdentifier: string, status?: RiskStatus) {
    const project = await this.resolveProject(projectIdentifier);
    return this.prisma.riskItem.findMany({
      where: {
        projectId: project.id,
        ...(status ? { status } : {}),
      },
      include: {
        ownerMember: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { identifiedAt: 'desc' }],
      take: 100,
    });
  }

  async updateStatus(riskId: string, status: RiskStatus, note?: string) {
    const risk = await this.prisma.riskItem.findUnique({ where: { id: riskId } });
    if (!risk) {
      throw new NotFoundException('Risk item not found');
    }

    return this.prisma.riskItem.update({
      where: { id: riskId },
      data: {
        status,
        resolvedAt:
          status === RiskStatus.RESOLVED || status === RiskStatus.DISMISSED ? new Date() : null,
        payload: {
          ...(risk.payload && typeof risk.payload === 'object' && !Array.isArray(risk.payload)
            ? (risk.payload as Record<string, unknown>)
            : {}),
          statusNote: note || null,
          statusUpdatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  async upsertDerivedRisk(input: UpsertRiskInput) {
    const existing = await this.prisma.riskItem.findFirst({
      where: {
        projectId: input.projectId,
        sourceKind: input.sourceKind,
        sourceRefId: input.sourceRefId ?? undefined,
        title: input.title,
        status: {
          in: [RiskStatus.OPEN, RiskStatus.ACKNOWLEDGED],
        },
      },
    });

    if (existing) {
      return this.prisma.riskItem.update({
        where: { id: existing.id },
        data: {
          description: input.description,
          severity: input.severity,
          ownerMemberId: input.ownerMemberId ?? undefined,
          payload: input.payload,
          resolvedAt: null,
        },
      });
    }

    return this.prisma.riskItem.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        severity: input.severity,
        sourceKind: input.sourceKind,
        sourceRefId: input.sourceRefId,
        ownerMemberId: input.ownerMemberId,
        payload: input.payload,
      },
    });
  }

  async resolveMissingDerivedRisks(params: {
    projectId: string;
    sourceKind: string;
    activeSourceRefIds: string[];
  }) {
    const openItems = await this.prisma.riskItem.findMany({
      where: {
        projectId: params.projectId,
        sourceKind: params.sourceKind,
        status: {
          in: [RiskStatus.OPEN, RiskStatus.ACKNOWLEDGED],
        },
      },
      select: { id: true, sourceRefId: true },
    });

    const staleIds = openItems
      .filter((item) => item.sourceRefId && !params.activeSourceRefIds.includes(item.sourceRefId))
      .map((item) => item.id);

    if (!staleIds.length) {
      return { resolved: 0 };
    }

    const result = await this.prisma.riskItem.updateMany({
      where: { id: { in: staleIds } },
      data: {
        status: RiskStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });

    return { resolved: result.count };
  }

  private async resolveProject(identifier: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }
}

