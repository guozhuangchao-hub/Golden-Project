import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AiReportsModule } from './modules/ai-reports/ai-reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UiModule } from './modules/ui/ui.module';
import { FeishuModule } from './modules/integrations/feishu/feishu.module';
import { AgentsModule } from './modules/integrations/agents/agents.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [
    PrismaModule,
    ProjectsModule,
    TasksModule,
    AiReportsModule,
    DashboardModule,
    UiModule,
    FeishuModule,
    AgentsModule,
    EventsModule,
  ],
})
export class AppModule {}
