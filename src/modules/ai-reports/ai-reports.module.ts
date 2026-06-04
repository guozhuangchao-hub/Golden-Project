import { Module } from '@nestjs/common';
import { AiReportsController } from './ai-reports.controller';
import { AiReportsService } from './ai-reports.service';

@Module({
  controllers: [AiReportsController],
  providers: [AiReportsService],
})
export class AiReportsModule {}
