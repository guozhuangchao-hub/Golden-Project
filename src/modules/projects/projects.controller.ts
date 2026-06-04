import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BootstrapProjectDto } from './dto/bootstrap-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { DeleteProjectDto } from './dto/delete-project.dto';
import { ReorderProjectModulesDto } from './dto/reorder-project-modules.dto';
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
  reorderModules(
    @Param('id') id: string,
    @Body() dto: ReorderProjectModulesDto,
  ) {
    return this.projectsService.reorderModules(id, dto.moduleIds);
  }

  @Patch(':id/modules/:moduleId')
  updateModule(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateProjectModuleDto,
  ) {
    return this.projectsService.updateModule(id, moduleId, dto);
  }

  @Get(':id/intake-workbook')
  async getIntakeWorkbook(@Param('id') id: string, @Res() res: Response) {
    const workbook = await this.projectsService.getProjectWorkbook(id);
    return res.download(workbook.workbookPath, workbook.workbookName);
  }

  @Get(':id/intake-workbook-location')
  getIntakeWorkbookLocation(@Param('id') id: string) {
    return this.projectsService.getProjectWorkbookLocation(id);
  }

  @Get(':id/files')
  getProjectFiles(@Param('id') id: string) {
    return this.projectsService.getProjectFiles(id);
  }

  @Get(':id/files/download')
  async downloadProjectFile(
    @Param('id') id: string,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    const file = await this.projectsService.getProjectFileDownload(id, filePath);
    return res.download(file.filePath, file.fileName);
  }

  @Post(':id/files/open')
  openProjectFile(@Param('id') id: string, @Query('path') filePath: string) {
    return this.projectsService.openProjectFile(id, filePath);
  }

  @Post(':id/intake-workbook/open')
  openIntakeWorkbook(@Param('id') id: string) {
    return this.projectsService.openProjectWorkbook(id);
  }

  @Post(':id/delete')
  remove(@Param('id') id: string, @Body() dto: DeleteProjectDto) {
    return this.projectsService.deleteProject(id, dto.password);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }
}
