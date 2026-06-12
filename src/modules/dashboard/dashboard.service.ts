import { Injectable, NotFoundException } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  private async resolveProject(identifier: string) {
    const project = await this.dashboardRepository.findProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async getProjectDashboard(projectIdentifier: string) {
    const project = await this.resolveProject(projectIdentifier);

    const projectDetail = await this.dashboardRepository.findProjectDashboardDetail(project.id);
    const tasks = await this.dashboardRepository.findProjectTasks(project.id);
    const taskStats = await this.dashboardRepository.findTaskStats(project.id);
    const memberStats = await this.dashboardRepository.findMemberStats(project.id);
    const overdueTasks = await this.dashboardRepository.findOverdueTasks(project.id);
    const staleTasks = await this.dashboardRepository.findStaleTasks(project.id);
    const helpTasks = await this.dashboardRepository.findHelpTasks(project.id);
    const todayReports = await this.dashboardRepository.findTodayReports(project.id);
    const riskItems = await this.dashboardRepository.findRiskItems(project.id);
    const feishuProposals = await this.dashboardRepository.findFeishuProposals(project.id);
    const events = await this.dashboardRepository.findEvents(project.id);

    const pendingEvents = events.filter((event) => event.status === 'pending_review');

    const eventStats = await this.dashboardRepository.findEventStats(project.id);

    return {
      project: projectDetail,
      tasks,
      taskStats,
      memberStats,
      overdueTasks,
      staleTasks,
      helpTasks,
      riskItems,
      todayReports,
      feishuProposals,
      events,
      pendingEvents,
      eventStats,
    };
  }
}
