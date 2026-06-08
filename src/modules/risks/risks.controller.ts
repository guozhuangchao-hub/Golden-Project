import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { RiskStatus } from '@prisma/client';
import { UpdateRiskStatusDto } from './dto/update-risk-status.dto';
import { RisksService } from './risks.service';

@Controller('projects/:projectId/risks')
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  @Get()
  list(@Param('projectId') projectId: string, @Query('status') status?: RiskStatus) {
    return this.risksService.list(projectId, status);
  }

  @Patch(':riskId/status')
  updateStatus(@Param('riskId') riskId: string, @Body() dto: UpdateRiskStatusDto) {
    return this.risksService.updateStatus(riskId, dto.status, dto.note);
  }
}

