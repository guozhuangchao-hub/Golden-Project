import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { MemberRole, MemberStatus, NotificationChannel, ProjectStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectMembersService } from '../project-members/project-members.service';
import { ProjectModulesService } from '../project-modules/project-modules.service';
import { ProjectDashboardService } from './project-dashboard.service';
import { ProjectFilesService } from './project-files.service';
import { IntakeSyncDto } from './dto/intake-sync.dto';
import { ProjectIntakeSyncService } from './project-intake-sync.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import {
  ProjectRuntimeStatePayload,
  ProjectRuntimeStateService,
} from './project-runtime-state.service';
import { BootstrapProjectDto } from './dto/bootstrap-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectModuleDto } from './dto/update-project-module.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectDashboardService: ProjectDashboardService,
    private readonly projectFilesService: ProjectFilesService,
    private readonly projectIntakeSyncService: ProjectIntakeSyncService,
    private readonly projectLifecycleService: ProjectLifecycleService,
    private readonly projectMembersService: ProjectMembersService,
    private readonly projectModulesService: ProjectModulesService,
    private readonly projectRuntimeStateService: ProjectRuntimeStateService,
  ) {}

  private async pathExists(targetPath: string) {
    try {
      await access(targetPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async resolveProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  create(dto: CreateProjectDto) {
    return this.projectLifecycleService.create(dto);
  }

  async bootstrapProject(dto: BootstrapProjectDto) {
    return this.projectLifecycleService.bootstrapProject(dto);
  }

  findAll() {
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(identifier: string) {
    const project = await this.resolveProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.findUnique({
      where: { id: project.id },
      include: {
        modules: true,
        feishuSetting: {
          include: {
            manager: true,
          },
        },
        feishuTaskProposals: {
          orderBy: { summaryDate: 'desc' },
          take: 5,
          include: {
            reviewedBy: true,
            setting: true,
          },
        },
        members: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async getDashboard(identifier: string) {
    return this.projectDashboardService.getDashboard(identifier);
  }

  async getProjectRuntimeState(identifier: string) {
    return this.projectRuntimeStateService.getProjectRuntimeState(identifier);
  }

  async updateProjectRuntimeState(identifier: string, payload: ProjectRuntimeStatePayload) {
    return this.projectRuntimeStateService.updateProjectRuntimeState(identifier, payload);
  }

  update(id: string, dto: UpdateProjectDto) {
    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        location: dto.location,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async intakeSync(identifier: string, dto: IntakeSyncDto) {
    return this.projectIntakeSyncService.syncProject(identifier, dto);
  }

  async reorderModules(identifier: string, moduleIds: string[]) {
    const project = await this.resolveProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const modules = await this.projectModulesService.findProjectModules(project.id);
    const validModuleIds = new Set(modules.map((module) => module.id));
    if (moduleIds.some((moduleId) => !validModuleIds.has(moduleId))) {
      throw new BadRequestException('Module list contains invalid module id');
    }

    await this.projectModulesService.reorderProjectModules(moduleIds);

    return this.projectModulesService.findProjectModules(project.id);
  }

  async updateModule(
    identifier: string,
    moduleId: string,
    dto: UpdateProjectModuleDto,
  ) {
    const project = await this.resolveProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectModule = await this.projectModulesService.findProjectModuleById(project.id, moduleId);

    if (!projectModule) {
      throw new NotFoundException('Project module not found');
    }

    let leaderMemberId: string | null | undefined = undefined;
    const leaderName = dto.leaderName?.trim();

    if (leaderName !== undefined) {
      if (!leaderName) {
        leaderMemberId = null;
      } else {
        const leaderMember = await this.projectMembersService.ensureNamedMember({
          projectId: project.id,
          projectCode: project.code,
          name: leaderName,
          role: MemberRole.LEADER,
          title: `${projectModule.name}负责人`,
          remark: '由项目结构页岗位调整加入',
        });
        leaderMemberId = leaderMember.id;
      }
    }

    return this.projectModulesService.updateProjectModule(projectModule.id, {
      description: dto.description,
      leaderMemberId,
    });
  }

  async getProjectWorkbook(identifier: string) {
    return this.projectFilesService.getProjectWorkbook(identifier);
  }

  async getProjectWorkbookLocation(identifier: string) {
    return this.projectFilesService.getProjectWorkbookLocation(identifier);
  }

  async getProjectFiles(identifier: string) {
    return this.projectFilesService.getProjectFiles(identifier);
  }

  async getProjectNotifications(identifier: string) {
    const project = await this.resolveProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        projectId: project.id,
        channel: NotificationChannel.MINI_PROGRAM,
      },
      include: {
        project: true,
        task: {
          include: {
            module: true,
            owner: true,
          },
        },
        receiver: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 80,
    });

    const latestByTask = new Map<string, (typeof notifications)[number]>();
    notifications.forEach((notification) => {
      const key = notification.taskId || notification.id;
      if (!latestByTask.has(key)) {
        latestByTask.set(key, notification);
      }
    });

    return Array.from(latestByTask.values()).map((notification) => ({
      id: notification.id,
      taskId: notification.taskId,
      title: notification.task?.title || notification.title,
      content: notification.content,
      source: notification.payload,
      channel: notification.channel,
      status: notification.status,
      createdAt: notification.createdAt,
      receiver: {
        id: notification.receiver.id,
        name: notification.receiver.name,
      },
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      task: notification.task
        ? {
            id: notification.task.id,
            title: notification.task.title,
            description: notification.task.description,
            status: notification.task.status,
            priority: notification.task.priority,
            dueTime: notification.task.dueTime,
            moduleName: notification.task.module?.name || '未分组',
            ownerName: notification.task.owner?.name || '待指定',
          }
        : null,
    }));
  }

  async getProjectFileDownload(identifier: string, relativeFilePath: string) {
    return this.projectFilesService.getProjectFileDownload(identifier, relativeFilePath);
  }

  async openProjectFile(identifier: string, relativeFilePath: string) {
    return this.projectFilesService.openProjectFile(identifier, relativeFilePath);
  }

  async openProjectWorkbook(identifier: string) {
    return this.projectFilesService.openProjectWorkbook(identifier);
  }

  async deleteProject(identifier: string, password: string) {
    return this.projectLifecycleService.deleteProject(identifier, password);
  }
}
