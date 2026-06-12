import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequireProjectPermission } from '../../platform/auth/permission.decorator';
import { BootstrapProjectDto } from './dto/bootstrap-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { DeleteProjectDto } from './dto/delete-project.dto';
import { IntakeSyncDto } from './dto/intake-sync.dto';
import { ReorderProjectModulesDto } from './dto/reorder-project-modules.dto';
import { UpdateProjectRuntimeStateDto } from './dto/runtime-state.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectModuleDto } from './dto/update-project-module.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Post('bootstrap')
  bootstrap(@Body() dto: BootstrapProjectDto) {
    return this.projectsService.bootstrapProject(dto);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/dashboard')
  getDashboard(@Param('id') id: string) {
    return this.projectsService.getDashboard(id);
  }

  @Patch(':id/modules/reorder')
  @RequireProjectPermission({
    action: 'PROJECT_STRUCTURE_WRITE',
    projectParam: 'id',
  })
  reorderModules(
    @Param('id') id: string,
    @Body() dto: ReorderProjectModulesDto,
  ) {
    return this.projectsService.reorderModules(id, dto.moduleIds);
  }

  @Patch(':id/modules/:moduleId')
  @RequireProjectPermission({
    action: 'PROJECT_STRUCTURE_WRITE',
    projectParam: 'id',
    resourceIdParam: 'moduleId',
  })
  updateModule(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateProjectModuleDto,
  ) {
    return this.projectsService.updateModule(id, moduleId, dto);
  }

  @Get(':id/intake-workbook')
  @RequireProjectPermission({
    action: 'PROJECT_FILE_READ',
    projectParam: 'id',
  })
  async getIntakeWorkbook(@Param('id') id: string, @Res() res: Response) {
    const workbook = await this.projectsService.getProjectWorkbook(id);
    return res.download(workbook.workbookPath, workbook.workbookName);
  }

  @Get(':id/intake-workbook-location')
  @RequireProjectPermission({
    action: 'PROJECT_FILE_READ',
    projectParam: 'id',
  })
  getIntakeWorkbookLocation(@Param('id') id: string) {
    return this.projectsService.getProjectWorkbookLocation(id);
  }

  @Get(':id/files')
  @RequireProjectPermission({
    action: 'PROJECT_FILE_READ',
    projectParam: 'id',
  })
  getProjectFiles(@Param('id') id: string) {
    return this.projectsService.getProjectFiles(id);
  }

  @Get(':id/runtime-state')
  getProjectRuntimeState(@Param('id') id: string) {
    return this.projectsService.getProjectRuntimeState(id);
  }

  @Get(':id/notifications')
  getProjectNotifications(@Param('id') id: string) {
    return this.projectsService.getProjectNotifications(id);
  }

  @Get(':id/files/download')
  @RequireProjectPermission({
    action: 'PROJECT_FILE_READ',
    projectParam: 'id',
  })
  async downloadProjectFile(
    @Param('id') id: string,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const file = await this.projectsService.getProjectFileDownload(id, filePath);
    return res.download(file.filePath, file.fileName);
  }

  @Post(':id/files/open')
  @RequireProjectPermission({
    action: 'PROJECT_FILE_READ',
    projectParam: 'id',
  })
  openProjectFile(@Param('id') id: string, @Query('path') filePath: string) {
    return this.projectsService.openProjectFile(id, filePath);
  }

  @Post(':id/intake-workbook/open')
  @RequireProjectPermission({
    action: 'PROJECT_FILE_READ',
    projectParam: 'id',
  })
  openIntakeWorkbook(@Param('id') id: string) {
    return this.projectsService.openProjectWorkbook(id);
  }

  @Post(':id/delete')
  @RequireProjectPermission({
    action: 'PROJECT_DELETE',
    projectParam: 'id',
  })
  remove(@Param('id') id: string, @Body() dto: DeleteProjectDto) {
    return this.projectsService.deleteProject(id, dto.password);
  }

  @Patch(':id')
  @RequireProjectPermission({
    action: 'PROJECT_STRUCTURE_WRITE',
    projectParam: 'id',
  })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Patch(':id/runtime-state')
  @RequireProjectPermission({
    action: 'PROJECT_RUNTIME_WRITE',
    projectParam: 'id',
  })
  updateRuntimeState(@Param('id') id: string, @Body() dto: UpdateProjectRuntimeStateDto) {
    return this.projectsService.updateProjectRuntimeState(id, dto);
  }

  @Post(':id/intake-sync')
  @RequireProjectPermission({
    action: 'PROJECT_RUNTIME_WRITE',
    projectParam: 'id',
  })
  intakeSync(@Param('id') id: string, @Body() dto: IntakeSyncDto) {
    return this.projectsService.intakeSync(id, dto);
  }
}
