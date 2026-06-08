import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RisksModule } from '../risks/risks.module';
import { WorkerService } from './worker.service';

@Module({
  imports: [NotificationsModule, RisksModule],
  providers: [WorkerService],
})
export class WorkerModule {}
