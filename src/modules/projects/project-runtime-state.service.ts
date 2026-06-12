import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ProjectRuntimeStatePayload = {
  structureTree?: unknown;
  identityClaims?: unknown;
  intakeSnapshot?: unknown;
};

@Injectable()
export class ProjectRuntimeStateService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  buildStructureSeed(
    projectName: string,
    modules: Array<{ id?: string; name?: string; desc?: string }>,
  ) {
    const rootId = `seed_root_${Date.now()}`;
    return {
      tree: [
        {
          id: rootId,
          name: projectName || '项目结构',
          parentId: null,
          sortOrder: 0,
          data: {
            taskName: '',
            taskTime: '',
            taskPerson: '',
            claimable: false,
            assignedMemberId: '',
            assignedMemberName: '',
          },
        },
        ...modules.map((module, index) => ({
          id: module.id ? `seed_mod_${module.id}` : `seed_mod_${index + 1}`,
          name: module.name || `模块${index + 1}`,
          parentId: rootId,
          sortOrder: index + 1,
          data: {
            taskName: module.desc || '',
            taskTime: '',
            taskPerson: '',
            claimable: true,
            assignedMemberId: '',
            assignedMemberName: '',
          },
        })),
      ],
      structureSource: 'intake_sync',
      updatedAt: new Date().toISOString(),
    };
  }

  async upsertRuntimeState(projectId: string, payload: ProjectRuntimeStatePayload) {
    const toJsonValue = (value: unknown) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return Prisma.JsonNull;
      }
      return value as Prisma.InputJsonValue;
    };

    const updateData: Prisma.ProjectRuntimeStateUpdateInput = {};
    if (payload.structureTree !== undefined) {
      updateData.structureTree = toJsonValue(payload.structureTree);
    }
    if (payload.identityClaims !== undefined) {
      updateData.identityClaims = toJsonValue(payload.identityClaims);
    }
    if (payload.intakeSnapshot !== undefined) {
      updateData.intakeSnapshot = toJsonValue(payload.intakeSnapshot);
    }

    return this.prisma.projectRuntimeState.upsert({
      where: { projectId },
      update: updateData,
      create: {
        projectId,
        structureTree: toJsonValue(payload.structureTree),
        identityClaims: toJsonValue(payload.identityClaims),
        intakeSnapshot: toJsonValue(payload.intakeSnapshot),
      },
    });
  }

  async getProjectRuntimeState(identifier: string) {
    const project = await this.resolveProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.projectRuntimeState.findUnique({
      where: { projectId: project.id },
    });
  }

  async updateProjectRuntimeState(identifier: string, payload: ProjectRuntimeStatePayload) {
    const project = await this.resolveProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.upsertRuntimeState(project.id, payload);
  }
}
