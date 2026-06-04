import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AiReportsService } from './ai-reports.service';
import { CreateAiReportDto } from './dto/create-ai-report.dto';

@Controller('projects/:projectId/ai-reports')
export class AiReportsController {
  constructor(private readonly aiReportsService: AiReportsService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateAiReportDto) {
    return this.aiReportsService.create(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.aiReportsService.findAll(projectId);
  }

  @Get(':reportId')
  findOne(@Param('reportId') reportId: string) {
    return this.aiReportsService.findOne(reportId);
  }
}
