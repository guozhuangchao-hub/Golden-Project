import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../platform/config/app-config.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

@Module({
  imports: [AppConfigModule, NotificationsModule],
  controllers: [TasksController],
  providers: [TasksRepository, TasksService],
  exports: [TasksService],
})
export class TasksModule {}
