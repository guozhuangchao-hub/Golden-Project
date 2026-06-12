import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequireProjectPermission } from '../../../platform/auth/permission.decorator';
import { ImportWechatMessagesDto } from './dto/import-wechat-messages.dto';
import { UpsertWechatSettingDto } from './dto/upsert-wechat-setting.dto';
import { WechatService } from './wechat.service';

@Controller('integrations/wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  @Get('projects/:projectId/setting')
  getProjectSetting(@Param('projectId') projectId: string) {
    return this.wechatService.getProjectSetting(projectId);
  }

  @Patch('projects/:projectId/setting')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  upsertProjectSetting(
    @Param('projectId') projectId: string,
    @Body() dto: UpsertWechatSettingDto,
  ) {
    return this.wechatService.upsertProjectSetting(projectId, dto);
  }

  @Post('projects/:projectId/messages/import')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  importMessages(
    @Param('projectId') projectId: string,
    @Body() dto: ImportWechatMessagesDto,
  ) {
    return this.wechatService.importMessages(projectId, dto);
  }

  @Get('projects/:projectId/messages')
  listMessages(@Param('projectId') projectId: string) {
    return this.wechatService.listMessages(projectId);
  }

  @Get('projects/:projectId/digests')
  listDigests(@Param('projectId') projectId: string) {
    return this.wechatService.listDigests(projectId);
  }

  @Post('projects/:projectId/digest')
  @RequireProjectPermission({
    action: 'AGENT_WORKFLOW_TRIGGER',
    projectParam: 'projectId',
  })
  runDigest(
    @Param('projectId') projectId: string,
    @Query('force') force?: string,
  ) {
    return this.wechatService.runDigestForProject(projectId, force !== 'false');
  }
}
