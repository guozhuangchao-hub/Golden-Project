import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RisksModule } from '../risks/risks.module';
import { WorkerRepository } from './worker.repository';
import { WorkerService } from './worker.service';

@Module({
  imports: [PrismaModule, NotificationsModule, RisksModule],
  providers: [WorkerRepository, WorkerService],
})
export class WorkerModule {}
