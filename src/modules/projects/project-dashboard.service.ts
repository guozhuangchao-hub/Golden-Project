import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProjectDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  async getDashboard(identifier: string) {
    const projectRecord = await this.resolveProjectByIdentifier(identifier);

    if (!projectRecord) {
      throw new NotFoundException('Project not found');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectRecord.id },
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

    const tasks = await this.prisma.task.findMany({
      where: { projectId: projectRecord.id },
      include: {
        owner: true,
        assistant: true,
        module: true,
      },
      orderBy: [{ dueTime: 'asc' }, { createdAt: 'asc' }],
    });

    const taskStats = await this.prisma.task.groupBy({
      by: ['status'],
      where: { projectId: projectRecord.id },
      _count: { _all: true },
    });

    const memberStats = await this.prisma.projectMember.groupBy({
      by: ['role'],
      where: {
        projectId: projectRecord.id,
        status: 'ACTIVE',
      },
      _count: { _all: true },
    });

    const overdueTasks = await this.prisma.task.findMany({
      where: {
        projectId: projectRecord.id,
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

    const todayReports = await this.prisma.aIReport.findMany({
      where: { projectId: projectRecord.id },
      orderBy: { reportDate: 'desc' },
      take: 3,
    });

    const feishuProposals = await this.prisma.feishuTaskProposal.findMany({
      where: { projectId: projectRecord.id },
      orderBy: { summaryDate: 'desc' },
      take: 5,
      include: {
        reviewedBy: true,
        setting: true,
      },
    });

    const events = await this.prisma.event.findMany({
      where: { projectId: projectRecord.id },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 20,
    });

    const pendingEvents = await this.prisma.event.findMany({
      where: {
        projectId: projectRecord.id,
        status: 'pending_review',
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
      orderBy: [{ confidence: 'asc' }, { createdAt: 'desc' }],
      take: 8,
    });

    const eventStats = await this.prisma.event.groupBy({
      by: ['status'],
      where: { projectId: projectRecord.id },
      _count: { _all: true },
    });

    const runtimeState = await this.prisma.projectRuntimeState.findUnique({
      where: { projectId: projectRecord.id },
    });

    return {
      project,
      tasks,
      taskStats,
      memberStats,
      overdueTasks,
      todayReports,
      feishuProposals,
      events,
      pendingEvents,
      eventStats,
      runtimeState,
    };
  }
}
