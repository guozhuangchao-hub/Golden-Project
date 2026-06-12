import { Injectable } from '@nestjs/common';
import { AIReportType, Prisma, RiskSeverity, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WorkerRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOverdueTaskIds() {
    return this.prisma.task.findMany({
      where: {
        dueTime: { lt: new Date() },
        status: {
          in: [TaskStatus.PENDING_CONFIRMATION, TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
        },
      },
      select: { id: true },
    });
  }

  findStaleTaskIds() {
    return this.prisma.task.findMany({
      where: {
        status: {
          in: [TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
        },
        OR: [
          { lastProgressAt: null, updatedAt: { lt: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
          { lastProgressAt: { lt: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
        ],
      },
      select: { id: true },
    });
  }

  findActiveProjects() {
    return this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });
  }

  findRiskCycleData(projectId: string) {
    return Promise.all([
      this.prisma.task.findMany({
        where: {
          projectId,
          dueTime: { lt: new Date() },
          status: {
            in: [TaskStatus.PENDING_CONFIRMATION, TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
          },
        },
        include: {
          ownerMember: true,
        },
      }),
      this.prisma.task.findMany({
        where: {
          projectId,
          needsHelp: true,
          status: {
            in: [TaskStatus.PENDING_CONFIRMATION, TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
          },
        },
        include: {
          ownerMember: true,
        },
      }),
      this.prisma.event.findMany({
        where: {
          projectId,
          status: 'pending_review',
        },
      }),
      this.prisma.messageSignal.findMany({
        where: {
          projectId,
          signalType: 'RISK_SIGNAL',
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
  }

  upsertRiskReport(params: {
    projectId: string;
    reportDate: Date;
    title: string;
    summary: string;
    content: string;
    sourceData: Record<string, unknown>;
  }) {
    return this.prisma.aIReport.upsert({
      where: {
        projectId_reportDate_type: {
          projectId: params.projectId,
          reportDate: params.reportDate,
          type: AIReportType.RISK,
        },
      },
      create: {
        projectId: params.projectId,
        reportDate: params.reportDate,
        type: AIReportType.RISK,
        title: params.title,
        summary: params.summary,
        content: params.content,
        generatedBy: 'phase-three-worker',
        sourceData: params.sourceData as Prisma.InputJsonValue,
      },
      update: {
        title: params.title,
        summary: params.summary,
        content: params.content,
        generatedBy: 'phase-three-worker',
        sourceData: params.sourceData as Prisma.InputJsonValue,
      },
    });
  }
}
