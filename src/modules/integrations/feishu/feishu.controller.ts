import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UpsertFeishuSettingDto } from './dto/upsert-feishu-setting.dto';
import { FeishuService } from './feishu.service';

@Controller('integrations/feishu')
export class FeishuController {
  constructor(private readonly feishuService: FeishuService) {}

  @Get('projects/:projectId/setting')
  getProjectSetting(@Param('projectId') projectId: string) {
    return this.feishuService.getProjectSetting(projectId);
  }

  @Patch('projects/:projectId/setting')
  upsertProjectSetting(
    @Param('projectId') projectId: string,
    @Body() dto: UpsertFeishuSettingDto,
  ) {
    return this.feishuService.upsertProjectSetting(projectId, dto);
  }

  @Get('projects/:projectId/messages')
  listMessages(@Param('projectId') projectId: string) {
    return this.feishuService.listInboundMessages(projectId);
  }

  @Get('projects/:projectId/proposals')
  listProposals(@Param('projectId') projectId: string) {
    return this.feishuService.listProposals(projectId);
  }

  @Post('projects/:projectId/digest')
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
  approveProposal(@Param('proposalId') proposalId: string) {
    return this.feishuService.handleCallbackWebhook({
      header: {
        event_type: 'card.action.trigger',
      },
      event: {
        action: {
          value: {
            proposalId,
            decision: 'approve',
          },
        },
      },
    });
  }
}
