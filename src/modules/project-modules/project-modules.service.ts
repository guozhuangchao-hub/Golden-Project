import { Injectable } from '@nestjs/common';
import { ModuleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProjectModulesService {
  constructor(private readonly prisma: PrismaService) {}

  findProjectModuleById(projectId: string, moduleId: string) {
    return this.prisma.projectModule.findFirst({
      where: {
        id: moduleId,
        projectId,
      },
    });
  }

  findProjectModules(projectId: string) {
    return this.prisma.projectModule.findMany({
      where: { projectId },
      include: {
        leaderMember: {
          include: { user: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findProjectModuleByName(projectId: string, name: string) {
    return this.prisma.projectModule.findFirst({
      where: { projectId, name },
    });
  }

  createProjectModule(params: {
    projectId: string;
    name: string;
    description?: string;
    sortOrder?: number;
  }) {
    return this.prisma.projectModule.create({
      data: {
        projectId: params.projectId,
        name: params.name,
        description: params.description || '',
        sortOrder: params.sortOrder ?? 0,
        status: ModuleStatus.ACTIVE,
      },
    });
  }

  updateProjectModule(moduleId: string, data: { description?: string; leaderMemberId?: string | null }) {
    return this.prisma.projectModule.update({
      where: { id: moduleId },
      data,
      include: {
        leaderMember: {
          include: { user: true },
        },
      },
    });
  }

  reorderProjectModules(moduleIds: string[]) {
    return this.prisma.$transaction(
      moduleIds.map((moduleId, index) =>
        this.prisma.projectModule.update({
          where: { id: moduleId },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
  }
}
