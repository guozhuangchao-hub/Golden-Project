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
import { WechatModule } from './modules/integrations/wechat/wechat.module';
import { MiniAppModule } from './modules/mini-app/mini-app.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpsSignalsModule } from './modules/ops-signals/ops-signals.module';
import { RisksModule } from './modules/risks/risks.module';
import { WorkerModule } from './modules/worker/worker.module';

@Module({
  imports: [
    PrismaModule,
    ProjectsModule,
    TasksModule,
    NotificationsModule,
    OpsSignalsModule,
    RisksModule,
    AiReportsModule,
    DashboardModule,
    UiModule,
    FeishuModule,
    WechatModule,
    AgentsModule,
    EventsModule,
    MiniAppModule,
    WorkerModule,
  ],
})
export class AppModule {}
