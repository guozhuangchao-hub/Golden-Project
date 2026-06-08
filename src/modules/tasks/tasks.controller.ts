import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskUpdateDto } from './dto/create-task-update.dto';
import { PublishTaskDto, TranslateTaskDto } from './dto/publish-task.dto';
import { TranslateByImageDto } from './dto/translate-by-image.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { TasksService } from './tasks.service';

@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(projectId, dto);
  }

  @Post('translate')
  translate(@Param('projectId') projectId: string, @Body() dto: TranslateTaskDto) {
    return this.tasksService.translatePublish(projectId, dto);
  }

  @Post('translate-by-image')
  translateByImage(@Param('projectId') projectId: string, @Body() dto: TranslateByImageDto) {
    return this.tasksService.translateByImage(projectId, dto);
  }

  @Post('publish')
  publish(@Param('projectId') projectId: string, @Body() dto: PublishTaskDto) {
    return this.tasksService.publish(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.tasksService.findAll(projectId);
  }

  @Get(':taskId')
  findOne(@Param('taskId') taskId: string) {
    return this.tasksService.findOne(taskId);
  }

  @Get(':taskId/updates')
  listUpdates(@Param('taskId') taskId: string) {
    return this.tasksService.listUpdates(taskId);
  }

  @Post(':taskId/confirm')
  confirm(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.changeStatus(taskId, dto, 'CONFIRMED');
  }

  @Post(':taskId/complete')
  complete(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.changeStatus(taskId, dto, 'COMPLETED');
  }

  @Post(':taskId/start')
  start(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.changeStatus(taskId, dto, 'IN_PROGRESS');
  }

  @Patch(':taskId/status')
  updateStatus(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.changeStatus(taskId, dto, dto.toStatus);
  }

  @Post(':taskId/updates')
  addUpdate(@Param('taskId') taskId: string, @Body() dto: CreateTaskUpdateDto) {
    return this.tasksService.addUpdate(taskId, dto);
  }
}
