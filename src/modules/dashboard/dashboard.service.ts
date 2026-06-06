import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getProjectDashboard(projectIdentifier: string) {
    const project = await this.resolveProject(projectIdentifier);

    const projectDetail = await this.prisma.project.findUnique({
      where: { id: project.id },
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
      where: { projectId: project.id },
      include: {
        owner: true,
        assistant: true,
        module: true,
      },
      orderBy: [{ dueTime: 'asc' }, { createdAt: 'asc' }],
    });

    const taskStats = await this.prisma.task.groupBy({
      by: ['status'],
      where: { projectId: project.id },
      _count: { _all: true },
    });

    const memberStats = await this.prisma.projectMember.groupBy({
      by: ['role'],
      where: { projectId: project.id, status: 'ACTIVE' },
      _count: { _all: true },
    });

    const overdueTasks = await this.prisma.task.findMany({
      where: {
        projectId: project.id,
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
      where: { projectId: project.id },
      orderBy: { reportDate: 'desc' },
      take: 3,
    });

    const feishuProposals = await this.prisma.feishuTaskProposal.findMany({
      where: { projectId: project.id },
      orderBy: { summaryDate: 'desc' },
      take: 5,
      include: {
        reviewedBy: true,
        setting: true,
      },
    });

    const events = await this.prisma.event.findMany({
      where: { projectId: project.id },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    });

    const pendingEvents = events.filter((event) => event.status === 'pending_review');

    const eventStats = await this.prisma.event.groupBy({
      by: ['status'],
      where: { projectId: project.id },
      _count: { _all: true },
    });

    return {
      project: projectDetail,
      tasks,
      taskStats,
      memberStats,
      overdueTasks,
      todayReports,
      feishuProposals,
      events,
      pendingEvents,
      eventStats,
    };
  }
}
