import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, MemberStatus, ProjectStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IntakeSyncDto } from './dto/intake-sync.dto';
import { ProjectRuntimeStateService } from './project-runtime-state.service';

@Injectable()
export class ProjectIntakeSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectRuntimeStateService: ProjectRuntimeStateService,
  ) {}

  private async resolveProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  private async ensureSystemUser() {
    return this.prisma.user.upsert({
      where: {
        email: 'system-import@golden.local',
      },
      update: {},
      create: {
        name: '系统导入',
        email: 'system-import@golden.local',
        remark: '用于 intake 同步与初始化的系统账号',
      },
    });
  }

  private buildProjectLocalEmail(projectCode: string | null | undefined, name: string) {
    const safeProject = (projectCode || 'golden-project')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${safeProject || 'project'}-${safeName || 'member'}@project.local`;
  }

  async syncProject(identifier: string, dto: IntakeSyncDto) {
    const projectRecord = await this.resolveProjectByIdentifier(identifier);
    if (!projectRecord) {
      throw new NotFoundException('Project not found');
    }

    const pid = projectRecord.id;
    await this.ensureSystemUser();

    const updateData: {
      name?: string;
      description?: string;
      location?: string;
      startDate?: Date;
      endDate?: Date;
      status?: ProjectStatus;
    } = {};
    if (dto.projectName) updateData.name = dto.projectName;
    if (dto.description) updateData.description = dto.description;
    if (dto.location) updateData.location = dto.location;
    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate) updateData.endDate = new Date(dto.endDate);
    if (Object.keys(updateData).length > 0) {
      await this.prisma.project.update({ where: { id: pid }, data: updateData });
    }

    if (dto.modules?.length) {
      for (let i = 0; i < dto.modules.length; i += 1) {
        const moduleInput = dto.modules[i];
        const existing = await this.prisma.projectModule.findFirst({
          where: { projectId: pid, name: moduleInput.name },
        });
        if (!existing) {
          await this.prisma.projectModule.create({
            data: {
              projectId: pid,
              name: moduleInput.name,
              description: moduleInput.desc || '',
              sortOrder: i + 1,
              status: 'ACTIVE',
            },
          });
        }
      }
    }

    if (dto.members?.length) {
      for (const memberInput of dto.members) {
        let user = await this.prisma.user.findFirst({ where: { name: memberInput.name } });
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              name: memberInput.name,
              email: this.buildProjectLocalEmail(projectRecord.code, memberInput.name),
              status: UserStatus.ACTIVE,
            },
          });
        }

        const existingMember = await this.prisma.projectMember.findFirst({
          where: { projectId: pid, userId: user.id },
        });
        if (!existingMember) {
          const roleMap: Record<string, MemberRole> = {
            组长: MemberRole.LEADER,
            管理员: MemberRole.ADMIN,
            执行人员: MemberRole.EXECUTOR,
            临时人员: MemberRole.TEMP,
          };
          await this.prisma.projectMember.create({
            data: {
              projectId: pid,
              userId: user.id,
              role: roleMap[memberInput.role || ''] || MemberRole.EXECUTOR,
              status: MemberStatus.ACTIVE,
              title: memberInput.title || '',
            },
          });
        }
      }
    }

    if (
      dto.modules?.length ||
      dto.members?.length ||
      dto.tasks?.length ||
      dto.projectName ||
      dto.description ||
      dto.location
    ) {
      const projectName = dto.projectName || projectRecord.name;
      const structureTree = this.projectRuntimeStateService.buildStructureSeed(
        projectName,
        dto.modules || [],
      );
      await this.projectRuntimeStateService.upsertRuntimeState(pid, {
        structureTree,
        intakeSnapshot: dto,
      });
    }

    return { ok: true, projectId: pid };
  }
}
