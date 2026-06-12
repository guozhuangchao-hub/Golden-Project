import { BadRequestException } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { AppConfigService } from '../src/platform/config/app-config.service';
import { ProjectFilesService } from '../src/modules/projects/project-files.service';
import { ProjectLifecycleService } from '../src/modules/projects/project-lifecycle.service';

describe('ProjectLifecycleService', () => {
  const createService = (overrides?: {
    appConfigService?: Partial<AppConfigService>;
    prisma?: any;
    projectFilesService?: Partial<ProjectFilesService>;
  }) => {
    const prisma = overrides?.prisma ?? {
      user: {
        upsert: jest.fn().mockResolvedValue({ id: 'system-user-1' }),
      },
      project: {
        create: jest.fn().mockResolvedValue({ id: 'project-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'project-1', code: 'GP-1', name: '项目A' }),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      taskLog: { deleteMany: jest.fn() },
      notification: { deleteMany: jest.fn() },
      aIReport: { deleteMany: jest.fn() },
      event: { deleteMany: jest.fn() },
      feishuTaskProposal: { deleteMany: jest.fn() },
      feishuMessage: { deleteMany: jest.fn() },
      agentInboundEvent: { deleteMany: jest.fn() },
      agentIntegrationSetting: { deleteMany: jest.fn() },
      feishuProjectSetting: { deleteMany: jest.fn() },
      projectModule: { deleteMany: jest.fn() },
      projectMember: { deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const appConfigService = (overrides?.appConfigService ?? {
      getProjectDeletePassword: jest.fn().mockReturnValue('delete-pass'),
    }) as AppConfigService;

    const projectFilesService = (overrides?.projectFilesService ?? {
      resolveProjectFolder: jest.fn().mockResolvedValue(null),
    }) as ProjectFilesService;

    return {
      service: new ProjectLifecycleService(appConfigService, prisma, projectFilesService),
      prisma,
      appConfigService,
      projectFilesService,
    };
  };

  it('creates projects with the ensured system user instead of a hard-coded seed id', async () => {
    const { service, prisma } = createService();

    await service.create({
      name: '企业发布会',
      code: 'GP-2026',
      description: 'desc',
      location: '上海',
      startDate: '2026-06-12T08:00:00.000Z',
      endDate: '2026-06-13T08:00:00.000Z',
    });

    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(prisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '企业发布会',
          status: ProjectStatus.DRAFT,
          createdById: 'system-user-1',
        }),
      }),
    );
  });

  it('rejects delete when PROJECT_DELETE_PASSWORD is not configured', async () => {
    const { service } = createService({
      appConfigService: {
        getProjectDeletePassword: jest.fn().mockReturnValue(undefined),
      },
    });

    await expect(service.deleteProject('project-1', 'whatever')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
