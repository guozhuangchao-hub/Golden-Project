import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequireProjectPermission } from '../../../platform/auth/permission.decorator';
import { UpsertFeishuSettingDto } from './dto/upsert-feishu-setting.dto';
import { FeishuService } from './feishu.service';

@Controller('integrations/feishu')
export class FeishuController {
  constructor(private readonly feishuService: FeishuService) {}

  @Get('projects/:projectId/setting')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  getProjectSetting(@Param('projectId') projectId: string) {
    return this.feishuService.getProjectSetting(projectId);
  }

  @Patch('projects/:projectId/setting')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  upsertProjectSetting(
    @Param('projectId') projectId: string,
    @Body() dto: UpsertFeishuSettingDto,
  ) {
    return this.feishuService.upsertProjectSetting(projectId, dto);
  }

  @Get('projects/:projectId/messages')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  listMessages(@Param('projectId') projectId: string) {
    return this.feishuService.listInboundMessages(projectId);
  }

  @Get('projects/:projectId/proposals')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  listProposals(@Param('projectId') projectId: string) {
    return this.feishuService.listProposals(projectId);
  }

  @Post('projects/:projectId/digest')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  runDigest(@Param('projectId') projectId: string) {
    return this.feishuService.runDigestForProject(projectId);
  }

  @Post('webhooks/events')
  handleEvents(@Body() body: Record<string, unknown>) {
    return this.feishuService.handleEventWebhook(body);
  }

  @Post('webhooks/callbacks')
  handleCallbacks(@Body() body: Record<string, unknown>) {
    return this.feishuService.handleCallbackWebhook(body);
  }

  @Post('proposals/:proposalId/approve')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    proposalParam: 'proposalId',
    resourceIdParam: 'proposalId',
  })
  approveProposal(@Param('proposalId') proposalId: string) {
    return this.feishuService.approveProposal(proposalId);
  }
}
