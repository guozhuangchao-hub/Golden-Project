import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  findProjectDashboardDetail(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            leaderMember: {
              include: {
                user: true,
              },
            },
          },
        },
        members: {
          where: { status: 'ACTIVE' },
          include: { user: true },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        },
        feishuSetting: {
          include: {
            manager: true,
          },
        },
      },
    });
  }

  findProjectTasks(projectId: string) {
    return this.prisma.task.findMany({
      where: { projectId },
      include: {
        owner: true,
        assistant: true,
        module: true,
      },
      orderBy: [{ dueTime: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findTaskStats(projectId: string) {
    return this.prisma.task.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    });
  }

  findMemberStats(projectId: string) {
    return this.prisma.projectMember.groupBy({
      by: ['role'],
      where: { projectId, status: 'ACTIVE' },
      _count: { _all: true },
    });
  }

  findOverdueTasks(projectId: string) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        dueTime: { lt: new Date() },
        status: {
          in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'],
        },
      },
      include: {
        owner: true,
        module: true,
      },
      orderBy: { dueTime: 'asc' },
      take: 8,
    });
  }

  findStaleTasks(projectId: string) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        status: {
          in: ['CONFIRMED', 'IN_PROGRESS'],
        },
        OR: [
          {
            lastProgressAt: null,
            updatedAt: { lt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
          },
          {
            lastProgressAt: { lt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
          },
        ],
      },
      include: {
        owner: true,
        module: true,
      },
      orderBy: [{ lastProgressAt: 'asc' }, { updatedAt: 'asc' }],
      take: 8,
    });
  }

  findHelpTasks(projectId: string) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        needsHelp: true,
        status: {
          in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'],
        },
      },
      include: {
        owner: true,
        module: true,
      },
      orderBy: [{ blockedAt: 'asc' }, { updatedAt: 'asc' }],
      take: 8,
    });
  }

  findTodayReports(projectId: string) {
    return this.prisma.aIReport.findMany({
      where: { projectId },
      orderBy: { reportDate: 'desc' },
      take: 3,
    });
  }

  findRiskItems(projectId: string) {
    return this.prisma.riskItem.findMany({
      where: {
        projectId,
        status: {
          in: ['OPEN', 'ACKNOWLEDGED'],
        },
      },
      include: {
        ownerMember: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ severity: 'desc' }, { identifiedAt: 'desc' }],
      take: 20,
    });
  }

  findFeishuProposals(projectId: string) {
    return this.prisma.feishuTaskProposal.findMany({
      where: { projectId },
      orderBy: { summaryDate: 'desc' },
      take: 5,
      include: {
        reviewedBy: true,
        setting: true,
      },
    });
  }

  findEvents(projectId: string) {
    return this.prisma.event.findMany({
      where: { projectId },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    });
  }

  findEventStats(projectId: string) {
    return this.prisma.event.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    });
  }
}
