import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ChatAgentDto } from './dto/chat-agent.dto';
import { ManagerWorkflowDto } from './dto/manager-workflow.dto';
import { MemberWorkflowDto } from './dto/member-workflow.dto';
import { UpsertAgentIntegrationDto } from './dto/upsert-agent-integration.dto';
import { AgentsService } from './agents.service';

@Controller('integrations/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('projects/:projectId/integrations/:provider')
  getIntegration(
    @Param('projectId') projectId: string,
    @Param('provider') provider: string,
  ) {
    return this.agentsService.getIntegration(projectId, provider);
  }

  @Patch('projects/:projectId/integrations')
  upsertIntegration(
    @Param('projectId') projectId: string,
    @Body() dto: UpsertAgentIntegrationDto,
  ) {
    return this.agentsService.upsertIntegration(projectId, dto);
  }

  @Get('projects/:projectId/events')
  listEvents(
    @Param('projectId') projectId: string,
    @Query('provider') provider?: string,
  ) {
    return this.agentsService.listEvents(projectId, provider);
  }

  @Post('webhooks/events')
  handleWebhook(@Body() body: Record<string, unknown>) {
    return this.agentsService.handleWebhook(body);
  }

  @Post('projects/:projectId/customer-service/chat')
  chat(
    @Param('projectId') projectId: string,
    @Body() dto: ChatAgentDto,
  ) {
    return this.agentsService.chat(projectId, dto);
  }

  @Post('projects/:projectId/workflows/manager-brief')
  managerBrief(
    @Param('projectId') projectId: string,
    @Body() dto: ManagerWorkflowDto,
  ) {
    return this.agentsService.runManagerBrief(projectId, dto);
  }

  @Post('projects/:projectId/workflows/member-brief')
  memberBrief(
    @Param('projectId') projectId: string,
    @Body() dto: MemberWorkflowDto,
  ) {
    return this.agentsService.runMemberBrief(projectId, dto);
  }

  @Post('events/:eventId/ack')
  acknowledgeEvent(
    @Param('eventId') eventId: string,
    @Body() body: { note?: string },
  ) {
    return this.agentsService.acknowledgeEvent(eventId, body.note);
  }
}
