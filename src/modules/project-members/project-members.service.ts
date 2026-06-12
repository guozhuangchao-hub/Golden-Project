import { Injectable } from '@nestjs/common';
import { MemberRole, MemberStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProjectMembersService {
  constructor(private readonly prisma: PrismaService) {}

  findProjectMemberById(memberId: string) {
    return this.prisma.projectMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
  }

  findProjectMemberByName(projectId: string, name: string) {
    return this.prisma.projectMember.findFirst({
      where: {
        projectId,
        user: { name },
      },
      include: { user: true },
    });
  }

  findActiveProjectMembers(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: {
        projectId,
        status: MemberStatus.ACTIVE,
      },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  findProjectMemberByProjectAndUser(projectId: string, userId: string) {
    return this.prisma.projectMember.findFirst({
      where: {
        projectId,
        userId,
        status: MemberStatus.ACTIVE,
      },
      include: { user: true },
    });
  }

  async ensureNamedMember(params: {
    projectId: string;
    projectCode?: string | null;
    name: string;
    role?: MemberRole;
    title?: string;
    remark?: string;
  }) {
    const existing = await this.findProjectMemberByName(params.projectId, params.name);
    if (existing) {
      return existing;
    }

    const email = this.buildProjectLocalEmail(params.projectCode, params.name);
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {
        name: params.name,
        status: UserStatus.ACTIVE,
      },
      create: {
        name: params.name,
        email,
        status: UserStatus.ACTIVE,
        remark: params.remark,
      },
    });

    return this.prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: params.projectId,
          userId: user.id,
        },
      },
      update: {
        role: params.role ?? MemberRole.EXECUTOR,
        status: MemberStatus.ACTIVE,
        title: params.title,
        remark: params.remark,
      },
      create: {
        projectId: params.projectId,
        userId: user.id,
        role: params.role ?? MemberRole.EXECUTOR,
        status: MemberStatus.ACTIVE,
        title: params.title,
        remark: params.remark,
      },
      include: { user: true },
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
}
