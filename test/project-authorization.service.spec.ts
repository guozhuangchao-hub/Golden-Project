import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { ProjectAuthorizationService } from '../src/platform/auth/project-authorization.service';

describe('ProjectAuthorizationService', () => {
  const createService = (overrides?: {
    project?: any;
    projectMember?: any;
    task?: any;
    event?: any;
  }) => {
    const prisma = {
      project: {
        findFirst:
          overrides?.project?.findFirst ??
          jest.fn().mockResolvedValue({ id: 'project-1' }),
      },
      projectMember: {
        findFirst:
          overrides?.projectMember?.findFirst ??
          jest.fn().mockResolvedValue({ id: 'member-1', role: MemberRole.ADMIN }),
      },
      task: {
        findUnique:
          overrides?.task?.findUnique ??
          jest.fn().mockResolvedValue({
            id: 'task-1',
            projectId: 'project-1',
            ownerMemberId: 'member-1',
            assistantMemberId: null,
          }),
      },
      event: {
        findUnique:
          overrides?.event?.findUnique ??
          jest.fn().mockResolvedValue({ id: 'event-1', projectId: 'project-1' }),
      },
    };

    return new ProjectAuthorizationService(prisma as any);
  };

  it('allows privileged system roles', async () => {
    const service = createService();

    const result = await service.assertAuthorized({
      actor: { systemRole: 'SYSTEM_ADMIN' },
      action: 'PROJECT_DELETE',
      projectIdentifier: 'project-1',
    });

    expect(result.projectId).toBe('project-1');
  });

  it('rejects requests without actor identity', async () => {
    const service = createService();

    await expect(
      service.assertAuthorized({
        actor: {},
        action: 'PROJECT_FILE_READ',
        projectIdentifier: 'project-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects project delete for non-admin members', async () => {
    const service = createService({
      projectMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member-2', role: MemberRole.LEADER }),
      },
    });

    await expect(
      service.assertAuthorized({
        actor: { userId: 'user-2' },
        action: 'PROJECT_DELETE',
        projectIdentifier: 'project-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows task member write for assigned members', async () => {
    const service = createService({
      projectMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member-3', role: MemberRole.EXECUTOR }),
      },
      task: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'task-1',
            projectId: 'project-1',
            ownerMemberId: 'member-3',
            assistantMemberId: null,
          }),
      },
    });

    const result = await service.assertAuthorized({
      actor: { userId: 'user-3' },
      action: 'TASK_MEMBER_WRITE',
      projectIdentifier: 'project-1',
      taskId: 'task-1',
    });

    expect(result.actorProjectMemberId).toBe('member-3');
  });
});
