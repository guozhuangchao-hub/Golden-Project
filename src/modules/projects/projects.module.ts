import { Module } from '@nestjs/common';
import { ProjectMembersModule } from '../project-members/project-members.module';
import { ProjectModulesModule } from '../project-modules/project-modules.module';
import { AppConfigModule } from '../../platform/config/app-config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectDashboardService } from './project-dashboard.service';
import { ProjectFilesService } from './project-files.service';
import { ProjectIntakeSyncService } from './project-intake-sync.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import { ProjectRuntimeStateService } from './project-runtime-state.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AppConfigModule, PrismaModule, ProjectMembersModule, ProjectModulesModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectDashboardService,
    ProjectFilesService,
    ProjectRuntimeStateService,
    ProjectIntakeSyncService,
    ProjectLifecycleService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
