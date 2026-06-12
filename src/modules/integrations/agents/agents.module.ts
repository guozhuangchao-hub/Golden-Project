import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../../platform/config/app-config.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [AppConfigModule, PrismaModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
