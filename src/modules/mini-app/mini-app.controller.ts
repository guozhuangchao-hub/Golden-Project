import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireProjectPermission } from '../../platform/auth/permission.decorator';
import { ConfirmMiniTaskDto } from './dto/confirm-mini-task.dto';
import { CreateHelpRequestDto } from './dto/create-help-request.dto';
import { CreateProgressUpdateDto } from './dto/create-progress-update.dto';
import { MiniAppService } from './mini-app.service';

@Controller('mini')
export class MiniAppController {
  constructor(private readonly miniAppService: MiniAppService) {}

  @Get('me/tasks')
  getMyTasks(
    @Query('memberId') memberId?: string,
    @Query('projectId') projectId?: string,
    @Query('nodeId') nodeId?: string,
  ) {
    return this.miniAppService.getMyTasks(memberId, projectId, nodeId);
  }

  @Get('me/reminders')
  getMyReminders(@Query('memberId') memberId: string, @Query('projectId') projectId?: string) {
    return this.miniAppService.getMyReminders(memberId, projectId);
  }

  @Get('project/:projectCode/brief')
  getProjectBrief(
    @Param('projectCode') projectCode: string,
    @Query('memberId') memberId?: string,
  ) {
    return this.miniAppService.getProjectBrief(projectCode, memberId);
  }

  @Get('project/:projectCode/contacts')
  getProjectContacts(@Param('projectCode') projectCode: string) {
    return this.miniAppService.getProjectContacts(projectCode);
  }

  @Get('project/:projectCode/identity-pool')
  getIdentityPool(
    @Param('projectCode') projectCode: string,
    @Query('memberId') memberId?: string,
  ) {
    return this.miniAppService.getIdentityPool(projectCode, memberId);
  }

  @Post('project/:projectCode/identity-claim')
  @RequireProjectPermission({
    action: 'PROJECT_RUNTIME_WRITE',
    projectParam: 'projectCode',
  })
  claimIdentity(
    @Param('projectCode') projectCode: string,
    @Body() dto: { memberId: string; nodeId: string },
  ) {
    return this.miniAppService.claimIdentity(projectCode, dto.memberId, dto.nodeId);
  }

  @Post('project/:projectCode/identity-release')
  @RequireProjectPermission({
    action: 'PROJECT_RUNTIME_WRITE',
    projectParam: 'projectCode',
  })
  releaseIdentity(
    @Param('projectCode') projectCode: string,
    @Body() dto: { memberId?: string; nodeId: string },
  ) {
    return this.miniAppService.releaseIdentity(projectCode, dto.nodeId, dto.memberId);
  }

  @Post('tasks/:taskId/confirm')
  @RequireProjectPermission({
    action: 'TASK_MEMBER_WRITE',
    taskParam: 'taskId',
  })
  confirmTask(@Param('taskId') taskId: string, @Body() dto: ConfirmMiniTaskDto) {
    return this.miniAppService.confirmTask(taskId, dto);
  }

  @Post('tasks/:taskId/progress')
  @RequireProjectPermission({
    action: 'TASK_MEMBER_WRITE',
    taskParam: 'taskId',
  })
  updateProgress(@Param('taskId') taskId: string, @Body() dto: CreateProgressUpdateDto) {
    return this.miniAppService.updateProgress(taskId, dto);
  }

  @Post('tasks/:taskId/help')
  @RequireProjectPermission({
    action: 'TASK_MEMBER_WRITE',
    taskParam: 'taskId',
  })
  askHelp(@Param('taskId') taskId: string, @Body() dto: CreateHelpRequestDto) {
    return this.miniAppService.askHelp(taskId, dto);
  }

  @Post('reminders/:notificationId/read')
  markReminderRead(@Param('notificationId') notificationId: string) {
    return this.miniAppService.markReminderRead(notificationId);
  }
}
