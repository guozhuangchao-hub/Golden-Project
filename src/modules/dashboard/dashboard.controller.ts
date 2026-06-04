import { Controller, Get, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('projects/:projectId/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getProjectDashboard(@Param('projectId') projectId: string) {
    return this.dashboardService.getProjectDashboard(projectId);
  }
}
