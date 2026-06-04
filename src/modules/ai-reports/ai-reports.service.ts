import { Injectable } from '@nestjs/common';
import { AIReportType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAiReportDto } from './dto/create-ai-report.dto';

@Injectable()
export class AiReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(projectId: string, dto: CreateAiReportDto) {
    return this.prisma.aIReport.create({
      data: {
        projectId,
        reportDate: new Date(dto.reportDate),
        type: dto.type ?? AIReportType.DAILY,
        title: dto.title,
        content: dto.content,
        summary: dto.summary,
        sourceData: dto.sourceData as Prisma.InputJsonValue | undefined,
        generatedBy: dto.generatedBy ?? 'coze',
      },
    });
  }

  findAll(projectId: string) {
    return this.prisma.aIReport.findMany({
      where: { projectId },
      orderBy: { reportDate: 'desc' },
    });
  }

  findOne(reportId: string) {
    return this.prisma.aIReport.findUnique({
      where: { id: reportId },
    });
  }
}
