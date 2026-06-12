import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { access, copyFile, mkdir, rm, writeFile } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { join } from 'path';
import { MemberRole, MemberStatus, ProjectStatus, UserStatus } from '@prisma/client';
import { AppConfigService } from '../../platform/config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BootstrapProjectDto } from './dto/bootstrap-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectFilesService } from './project-files.service';

@Injectable()
export class ProjectLifecycleService {
  private readonly projectRoot = join(process.cwd(), '项目列表');
  private readonly templateRoot = join(this.projectRoot, '项目模板');
  private readonly initialDocsFolderName = '初始文档';
  private readonly intakeTemplatePath = join(this.templateRoot, '前期录入模板.xlsx');
  private readonly infoTemplatePath = join(this.templateRoot, '项目信息.md');
  private readonly projectCodeSuffix = 'YHGG';

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly projectFilesService: ProjectFilesService,
  ) {}

  private normalizeFolderName(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private formatDateStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private getChineseInitial(char: string) {
    if (!char) {
      return '';
    }

    const ascii = char[0];
    if (/[A-Za-z0-9]/.test(ascii)) {
      return ascii.toUpperCase();
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const iconv = require('iconv-lite') as {
        encode: (value: string, encoding: string) => Buffer;
      };
      const encoded = iconv.encode(ascii, 'gbk');
      if (encoded.length < 2) {
        return '';
      }

      const code = (encoded[0] << 8) + encoded[1];
      const ranges: Array<[number, number, string]> = [
        [45217, 45252, 'A'],
        [45253, 45760, 'B'],
        [45761, 46317, 'C'],
        [46318, 46825, 'D'],
        [46826, 47009, 'E'],
        [47010, 47296, 'F'],
        [47297, 47613, 'G'],
        [47614, 48118, 'H'],
        [48119, 49061, 'J'],
        [49062, 49323, 'K'],
        [49324, 49895, 'L'],
        [49896, 50370, 'M'],
        [50371, 50613, 'N'],
        [50614, 50621, 'O'],
        [50622, 50905, 'P'],
        [50906, 51386, 'Q'],
        [51387, 51445, 'R'],
        [51446, 52217, 'S'],
        [52218, 52697, 'T'],
        [52698, 52979, 'W'],
        [52980, 53689, 'X'],
        [53690, 54480, 'Y'],
        [54481, 55289, 'Z'],
      ];

      const matched = ranges.find(([min, max]) => code >= min && code <= max);
      return matched?.[2] ?? '';
    } catch {
      return '';
    }
  }

  private buildProjectAbbreviation(projectName: string) {
    const segments = projectName.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]/g) ?? [];
    const initials = segments
      .map((segment) => {
        if (/^[A-Za-z0-9]+$/.test(segment)) {
          return segment.toUpperCase();
        }
        return this.getChineseInitial(segment);
      })
      .join('');

    return initials.replace(/[^A-Z0-9]/g, '').toUpperCase() || 'XM';
  }

  private async pathExists(targetPath: string) {
    try {
      await access(targetPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async resolveUniqueFolderName(baseName: string, dateStamp: string) {
    const sanitized = this.normalizeFolderName(baseName) || '新项目';
    const candidates = [sanitized, `${sanitized}-${dateStamp}`];

    for (const candidate of candidates) {
      if (!(await this.pathExists(join(this.projectRoot, candidate)))) {
        return candidate;
      }
    }

    let index = 2;
    while (true) {
      const candidate = `${sanitized}-${dateStamp}-${index}`;
      if (!(await this.pathExists(join(this.projectRoot, candidate)))) {
        return candidate;
      }
      index += 1;
    }
  }

  private async resolveUniqueProjectCode(projectName: string, dateStamp: string) {
    const abbreviation = this.buildProjectAbbreviation(projectName);
    let candidate = `${abbreviation}${dateStamp}${this.projectCodeSuffix}`;
    let index = 2;

    while (await this.prisma.project.findUnique({ where: { code: candidate } })) {
      candidate = `${abbreviation}${dateStamp}${this.projectCodeSuffix}-${index}`;
      index += 1;
    }

    return candidate;
  }

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
        remark: '用于项目初始化与系统代创建的系统账号',
      },
    });
  }

  private buildBootstrapMeta(params: {
    projectName: string;
    folderName: string;
    projectCode: string;
    workbookName: string;
  }) {
    const { projectName, folderName, projectCode, workbookName } = params;

    return {
      projectName,
      shortName: projectName,
      folderName,
      projectCode,
      projectType: '',
      projectStatus: 'planning',
      city: '',
      projectDescription: '',
      projectManager: '',
      businessContact: '',
      dateRange: {
        start: '',
        end: '',
        peakWindowStart: '',
        peakWindowEnd: '',
      },
      sourceDocument: {
        fileName: workbookName,
        sheetName: '基础信息',
        title: '项目前期录入模板',
      },
      summary: {
        activityCount: 0,
        taskItemCount: 0,
        locationCount: 0,
        departmentCount: 0,
        contactCount: 0,
      },
      primaryActivities: [],
      primaryVenues: [],
      primaryDepartments: [],
      keyContacts: [],
      recommendedModules: [],
      moduleDetails: [],
      activityDetails: [],
      venueDetails: [],
      departmentContacts: [],
      supplierDetails: [],
      taskDrafts: [],
      riskItems: [],
      agentIntegration: {
        '可接入 agent': 'Hermes / 其他',
        '接入方式': 'webhook / API',
        '读取范围': '',
        '写回范围': '',
        '审核方式': '项目经理确认',
      },
      intakeWorkbook: {
        fileName: workbookName,
        sheetName: '填写说明',
      },
    };
  }

  private buildProjectInfoMarkdown(params: {
    projectName: string;
    projectCode: string;
    folderName: string;
    workbookName: string;
    createdDate: string;
  }) {
    const { projectName, projectCode, folderName, workbookName, createdDate } = params;

    return `# 项目信息

## 基础信息

- 项目名称：${projectName}
- 项目简称：${projectName}
- 项目目录：${folderName}
- 项目类型：
- 当前阶段：planning
- 主要城市：
- 建议项目编码：${projectCode}

## 来源文档

- 原始文档：${workbookName}
- 文档标题：项目前期录入模板
- 文档性质：前期录入模板

## 时间范围

- 创建日期：${createdDate}
- 项目开始日期：
- 项目结束日期：
- 核心活动高峰：

## 项目规模摘要

- 主要活动数量：0
- 筹备事项数量：0
- 涉及地点数量：0
- 涉及责任单位数量：0
- 涉及联系人数量：0

## 主要活动

- 

## 主要场地

- 

## 主要责任单位

- 

## 高频联系人

- 

## 建议系统初始化字段

- 项目名称：${projectName}
- 项目编码：${projectCode}
- 项目状态：planning
- 项目地点：
- 开始日期：
- 结束日期：
- 项目描述：

## 建议模块拆分

- 

## 备注

- 项目创建于 ${createdDate}，前期录入 Excel 已放入项目文件夹。
`;
  }

  async create(dto: CreateProjectDto) {
    const systemUser = await this.ensureSystemUser();

    return this.prisma.project.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        location: dto.location,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: ProjectStatus.DRAFT,
        createdById: systemUser.id,
      },
    });
  }

  async bootstrapProject(dto: BootstrapProjectDto) {
    const projectName = dto.name.trim();
    if (!projectName) {
      throw new BadRequestException('Project name is required');
    }

    await mkdir(this.projectRoot, { recursive: true });
    await mkdir(this.templateRoot, { recursive: true });

    const createdAt = new Date();
    const dateStamp = this.formatDateStamp(createdAt);
    const createdDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;
    const folderName = await this.resolveUniqueFolderName(projectName, dateStamp);
    const folderPath = join(this.projectRoot, folderName);
    const initialDocsPath = join(folderPath, this.initialDocsFolderName);
    const workbookName = `${this.normalizeFolderName(projectName) || '新项目'}-${dateStamp}.xlsx`;
    const workbookPath = join(folderPath, workbookName);
    const metaPath = join(folderPath, 'project.meta.json');
    const infoPath = join(folderPath, '项目信息.md');
    const projectCode = await this.resolveUniqueProjectCode(projectName, dateStamp);

    if (!(await this.pathExists(this.intakeTemplatePath))) {
      throw new BadRequestException('前期录入模板.xlsx 不存在，请先生成模板文件');
    }

    await mkdir(folderPath, { recursive: true });
    await mkdir(initialDocsPath, { recursive: true });
    await copyFile(this.intakeTemplatePath, workbookPath);

    const meta = this.buildBootstrapMeta({
      projectName,
      folderName,
      projectCode,
      workbookName,
    });

    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    await writeFile(
      infoPath,
      this.buildProjectInfoMarkdown({
        projectName,
        projectCode,
        folderName,
        workbookName,
        createdDate,
      }),
      'utf8',
    );

    const systemUser = await this.ensureSystemUser();
    const project = await this.prisma.project.create({
      data: {
        name: projectName,
        code: projectCode,
        description: `项目已创建，前期录入模板已生成。请在 ${folderName} 文件夹中填写 Excel。`,
        status: ProjectStatus.DRAFT,
        createdById: systemUser.id,
      },
    });

    return {
      project,
      folderName,
      folderPath,
      initialDocsPath,
      workbookName,
      workbookPath,
      metaPath,
      infoPath,
    };
  }

  async deleteProject(identifier: string, password: string) {
    const expectedPassword = this.appConfigService.getProjectDeletePassword();
    if (!expectedPassword) {
      throw new BadRequestException('PROJECT_DELETE_PASSWORD not configured');
    }
    if (password !== expectedPassword) {
      throw new ForbiddenException('删除密码不正确');
    }

    const project = await this.resolveProjectByIdentifier(identifier);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectFolder = await this.projectFilesService.resolveProjectFolder(identifier);
    if (projectFolder?.folderPath) {
      await rm(projectFolder.folderPath, { recursive: true, force: true });
    }

    const taskIds = await this.prisma.task.findMany({
      where: { projectId: project.id },
      select: { id: true },
    });
    const taskIdList = taskIds.map((task) => task.id);

    await this.prisma.$transaction([
      this.prisma.taskLog.deleteMany({
        where: {
          taskId: {
            in: taskIdList,
          },
        },
      }),
      this.prisma.notification.deleteMany({
        where: taskIdList.length
          ? {
              OR: [
                { projectId: project.id },
                {
                  taskId: {
                    in: taskIdList,
                  },
                },
              ],
            }
          : {
              projectId: project.id,
            },
      }),
      this.prisma.aIReport.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.event.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.feishuTaskProposal.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.feishuMessage.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.agentInboundEvent.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.agentIntegrationSetting.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.feishuProjectSetting.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.task.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.projectModule.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.projectMember.deleteMany({
        where: { projectId: project.id },
      }),
      this.prisma.project.delete({
        where: { id: project.id },
      }),
    ]);

    return {
      success: true,
      removedProject: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      removedFolderPath: projectFolder?.folderPath || null,
    };
  }
}
