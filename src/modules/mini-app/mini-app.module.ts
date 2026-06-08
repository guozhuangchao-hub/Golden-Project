import { Module } from '@nestjs/common';
import { AgentsModule } from '../integrations/agents/agents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { MiniAppController } from './mini-app.controller';
import { MiniAppService } from './mini-app.service';

@Module({
  imports: [TasksModule, NotificationsModule, AgentsModule],
  controllers: [MiniAppController],
  providers: [MiniAppService],
})
export class MiniAppModule {}

