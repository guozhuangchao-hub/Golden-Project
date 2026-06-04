import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mkdir, copyFile, writeFile, access, readFile, readdir, rm, stat } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { basename, extname, isAbsolute, join, normalize, relative } from 'path';
import { pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { MemberRole, MemberStatus, ProjectStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BootstrapProjectDto } from './dto/bootstrap-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectModuleDto } from './dto/update-project-module.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

type ProjectFileItem = {
  name: string;
  relativePath: string;
  directory: string;
  extension: string;
  category: string;
  size: number;
  sizeLabel: string;
  updatedAt: string;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly projectRoot = join(process.cwd(), '项目列表');
  private readonly templateRoot = join(this.projectRoot, '项目模板');
  private readonly intakeTemplatePath = join(this.templateRoot, '前期录入模板.xlsx');
  private readonly infoTemplatePath = join(this.templateRoot, '项目信息.md');
  private readonly projectCodeSuffix = 'YHGG';
  private readonly hiddenFileNames = new Set(['.DS_Store', 'project.meta.json']);

  private normalizeFolderName(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
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

  private async resolveProjectFolder(identifier: string) {
    if (!(await this.pathExists(this.projectRoot))) {
      return null;
    }

    const entries = await readdir(this.projectRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '项目模板') {
        continue;
      }

      const folderPath = join(this.projectRoot, entry.name);
      const metaPath = join(folderPath, 'project.meta.json');

      if (!(await this.pathExists(metaPath))) {
        continue;
      }

      try {
        const rawMeta = await readFile(metaPath, 'utf8');
        const meta = JSON.parse(rawMeta) as {
          projectName?: string;
          projectCode?: string;
          folderName?: string;
          intakeWorkbook?: { fileName?: string };
        };

        if (
          meta.projectCode === identifier ||
          meta.projectName === identifier ||
          meta.folderName === identifier ||
          entry.name === identifier
        ) {
          return { folderPath, metaPath, meta };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async resolveProjectWorkbook(identifier: string) {
    const projectFolder = await this.resolveProjectFolder(identifier);

    if (!projectFolder) {
      return null;
    }

    const workbookName = projectFolder.meta.intakeWorkbook?.fileName;
    if (workbookName) {
      const workbookPath = join(projectFolder.folderPath, workbookName);
      if (await this.pathExists(workbookPath)) {
        return {
          folderPath: projectFolder.folderPath,
          workbookPath,
          workbookName,
        };
      }
    }

    const folderEntries = await readdir(projectFolder.folderPath, { withFileTypes: true });
    const workbookEntry = folderEntries.find(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'),
    );

    if (!workbookEntry) {
      return null;
    }

    return {
      folderPath: projectFolder.folderPath,
      workbookPath: join(projectFolder.folderPath, workbookEntry.name),
      workbookName: workbookEntry.name,
    };
  }

  private getProjectFileCategory(fileName: string) {
    const lowerName = fileName.toLowerCase();
    const extension = extname(lowerName);

    if (fileName.includes('方案') || fileName.includes('策划') || fileName.includes('计划')) {
      return 'plans';
    }

    if (['.xlsx', '.xlsm', '.xls', '.csv'].includes(extension)) {
      return 'spreadsheets';
    }

    if (['.pdf'].includes(extension)) {
      return 'pdfs';
    }

    if (['.doc', '.docx', '.md', '.txt'].includes(extension)) {
      return 'documents';
    }

    if (['.ppt', '.pptx'].includes(extension)) {
      return 'presentations';
    }

    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic'].includes(extension)) {
      return 'images';
    }

    return 'others';
  }

  private formatFileSize(size: number) {
    if (size >= 1024 * 1024) {
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    }

    if (size >= 1024) {
      return `${Math.round(size / 1024)} KB`;
    }

    return `${size} B`;
  }

  private async scanProjectFiles(folderPath: string, currentPath = folderPath): Promise<ProjectFileItem[]> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    const files: ProjectFileItem[] = [];

    for (const entry of entries) {
      if (this.hiddenFileNames.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.scanProjectFiles(folderPath, fullPath)));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const fileStat = await stat(fullPath);
      const relativePath = relative(folderPath, fullPath);
      const extension = extname(entry.name).replace('.', '').toUpperCase() || 'FILE';

      files.push({
        name: entry.name,
        relativePath,
        directory: relative(folderPath, currentPath) || '项目根目录',
        extension,
        category: this.getProjectFileCategory(entry.name),
        size: fileStat.size,
        sizeLabel: this.formatFileSize(fileStat.size),
        updatedAt: fileStat.mtime.toISOString(),
      });
    }

    return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private resolveSafeProjectFilePath(folderPath: string, relativeFilePath: string) {
    const normalized = normalize(relativeFilePath || '');

    if (
      !normalized ||
      isAbsolute(normalized) ||
      normalized.startsWith('..') ||
      normalized === '.' ||
      normalized.includes('\0')
    ) {
      throw new BadRequestException('Invalid file path');
    }

    const filePath = join(folderPath, normalized);
    const scoped = relative(folderPath, filePath);

    if (scoped.startsWith('..') || scoped === '') {
      throw new BadRequestException('Invalid file path');
    }

    return filePath;
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
        remark: '用于项目文件夹自动同步入库的系统账号',
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

  create(dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        location: dto.location,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: ProjectStatus.DRAFT,
        // MVP phase: replace with authenticated user id later.
        createdById: 'SYSTEM_SEED_USER_ID',
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
    const workbookName = `${this.normalizeFolderName(projectName) || '新项目'}-${dateStamp}.xlsx`;
    const workbookPath = join(folderPath, workbookName);
    const metaPath = join(folderPath, 'project.meta.json');
    const infoPath = join(folderPath, '项目信息.md');
    const projectCode = await this.resolveUniqueProjectCode(projectName, dateStamp);

    if (!(await this.pathExists(this.intakeTemplatePath))) {
      throw new BadRequestException('前期录入模板.xlsx 不存在，请先生成模板文件');
    }

    await mkdir(folderPath, { recursive: true });
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
      workbookName,
      workbookPath,
      metaPath,
      infoPath,
    };
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
    const projectRecord = await this.resolveProjectByIdentifier(identifier);

    if (!projectRecord) {
      throw new NotFoundException('Project not found');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectRecord.id },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            leaderMember: {
              include: {
                user: true,
              },
            },
          },
        },
        members: {
          where: { status: 'ACTIVE' },
          include: { user: true },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        },
        feishuSetting: {
          include: {
            manager: true,
          },
        },
      },
    });

    const tasks = await this.prisma.task.findMany({
      where: { projectId: projectRecord.id },
      include: {
        owner: true,
        assistant: true,
        module: true,
      },
      orderBy: [{ dueTime: 'asc' }, { createdAt: 'asc' }],
    });

    const taskStats = await this.prisma.task.groupBy({
      by: ['status'],
      where: { projectId: projectRecord.id },
      _count: { _all: true },
    });

    const memberStats = await this.prisma.projectMember.groupBy({
      by: ['role'],
      where: {
        projectId: projectRecord.id,
        status: 'ACTIVE',
      },
      _count: { _all: true },
    });

    const overdueTasks = await this.prisma.task.findMany({
      where: {
        projectId: projectRecord.id,
        dueTime: { lt: new Date() },
        status: {
          in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'],
        },
      },
      include: {
        owner: true,
        module: true,
      },
      orderBy: { dueTime: 'asc' },
      take: 8,
    });

    const todayReports = await this.prisma.aIReport.findMany({
      where: { projectId: projectRecord.id },
      orderBy: { reportDate: 'desc' },
      take: 3,
    });

    const feishuProposals = await this.prisma.feishuTaskProposal.findMany({
      where: { projectId: projectRecord.id },
      orderBy: { summaryDate: 'desc' },
      take: 5,
      include: {
        reviewedBy: true,
        setting: true,
      },
    });

    const events = await this.prisma.event.findMany({
      where: { projectId: projectRecord.id },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 20,
    });

    const pendingEvents = await this.prisma.event.findMany({
      where: {
        projectId: projectRecord.id,
        status: 'pending_review',
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
      orderBy: [{ confidence: 'asc' }, { createdAt: 'desc' }],
      take: 8,
    });

    const eventStats = await this.prisma.event.groupBy({
      by: ['status'],
      where: { projectId: projectRecord.id },
      _count: { _all: true },
    });

    return {
      project,
      tasks,
      taskStats,
      memberStats,
      overdueTasks,
      todayReports,
      feishuProposals,
      events,
      pendingEvents,
      eventStats,
    };
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

  async reorderModules(identifier: string, moduleIds: string[]) {
    const project = await this.resolveProjectByIdentifier(identifier);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const modules = await this.prisma.projectModule.findMany({
      where: {
        projectId: project.id,
        id: { in: moduleIds },
      },
      select: { id: true },
    });

    if (modules.length !== moduleIds.length) {
      throw new BadRequestException('Module list contains invalid module id');
    }

    await this.prisma.$transaction(
      moduleIds.map((moduleId, index) =>
        this.prisma.projectModule.update({
          where: { id: moduleId },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return this.prisma.projectModule.findMany({
      where: { projectId: project.id },
      include: {
        leaderMember: {
          include: { user: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
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

    const projectModule = await this.prisma.projectModule.findFirst({
      where: {
        id: moduleId,
        projectId: project.id,
      },
    });

    if (!projectModule) {
      throw new NotFoundException('Project module not found');
    }

    let leaderMemberId: string | null | undefined = undefined;
    const leaderName = dto.leaderName?.trim();

    if (leaderName !== undefined) {
      if (!leaderName) {
        leaderMemberId = null;
      } else {
        let leaderMember = await this.prisma.projectMember.findFirst({
          where: {
            projectId: project.id,
            user: {
              name: leaderName,
            },
          },
          include: { user: true },
        });

        if (!leaderMember) {
          const email = this.buildProjectLocalEmail(project.code, leaderName);
          const user = await this.prisma.user.upsert({
            where: { email },
            update: {
              name: leaderName,
              status: UserStatus.ACTIVE,
            },
            create: {
              name: leaderName,
              email,
              status: UserStatus.ACTIVE,
              remark: '由项目结构页岗位调整自动创建',
            },
          });

          leaderMember = await this.prisma.projectMember.upsert({
            where: {
              projectId_userId: {
                projectId: project.id,
                userId: user.id,
              },
            },
            update: {
              role: MemberRole.LEADER,
              status: MemberStatus.ACTIVE,
              title: `${projectModule.name}负责人`,
            },
            create: {
              projectId: project.id,
              userId: user.id,
              role: MemberRole.LEADER,
              status: MemberStatus.ACTIVE,
              title: `${projectModule.name}负责人`,
              remark: '由项目结构页岗位调整加入',
            },
            include: { user: true },
          });
        }

        leaderMemberId = leaderMember.id;
      }
    }

    return this.prisma.projectModule.update({
      where: { id: projectModule.id },
      data: {
        description: dto.description,
        leaderMemberId,
      },
      include: {
        leaderMember: {
          include: { user: true },
        },
      },
    });
  }

  async getProjectWorkbook(identifier: string) {
    const workbook = await this.resolveProjectWorkbook(identifier);

    if (!workbook) {
      throw new NotFoundException('Project workbook not found');
    }

    return workbook;
  }

  async getProjectWorkbookLocation(identifier: string) {
    const workbook = await this.getProjectWorkbook(identifier);

    return {
      folderPath: workbook.folderPath,
      workbookPath: workbook.workbookPath,
      workbookName: workbook.workbookName,
      fileUrl: pathToFileURL(workbook.workbookPath).href,
    };
  }

  async getProjectFiles(identifier: string) {
    const project = await this.resolveProjectByIdentifier(identifier);
    const projectFolder = await this.resolveProjectFolder(identifier);

    if (!project || !projectFolder) {
      throw new NotFoundException('Project folder not found');
    }

    const files = await this.scanProjectFiles(projectFolder.folderPath);
    const categoryCounts = files.reduce<Record<string, number>>((acc, file) => {
      acc[file.category] = (acc[file.category] || 0) + 1;
      return acc;
    }, {});

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
      },
      folderName: basename(projectFolder.folderPath),
      folderPath: projectFolder.folderPath,
      files,
      summary: {
        total: files.length,
        categoryCounts,
      },
    };
  }

  async getProjectFileDownload(identifier: string, relativeFilePath: string) {
    const projectFolder = await this.resolveProjectFolder(identifier);

    if (!projectFolder) {
      throw new NotFoundException('Project folder not found');
    }

    const filePath = this.resolveSafeProjectFilePath(projectFolder.folderPath, relativeFilePath);
    const fileStat = await stat(filePath).catch(() => null);

    if (!fileStat?.isFile()) {
      throw new NotFoundException('Project file not found');
    }

    return {
      filePath,
      fileName: basename(filePath),
    };
  }

  private async openLocalFile(filePath: string) {
    await new Promise<void>((resolve, reject) => {
      const opener =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open';

      const args =
        process.platform === 'darwin'
          ? [filePath]
          : process.platform === 'win32'
            ? ['/c', 'start', '""', filePath]
            : [filePath];

      const child = execFile(opener, args, { windowsHide: true }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });

      child.unref();
    });
  }

  async openProjectFile(identifier: string, relativeFilePath: string) {
    const file = await this.getProjectFileDownload(identifier, relativeFilePath);
    await this.openLocalFile(file.filePath);

    return {
      success: true,
      fileName: file.fileName,
      filePath: file.filePath,
    };
  }

  async openProjectWorkbook(identifier: string) {
    const workbook = await this.getProjectWorkbook(identifier);
    await this.openLocalFile(workbook.workbookPath);

    return {
      success: true,
      workbookName: workbook.workbookName,
      workbookPath: workbook.workbookPath,
    };
  }

  async deleteProject(identifier: string, password: string) {
    const expectedPassword = process.env.PROJECT_DELETE_PASSWORD || 'yhgg';
    if (password !== expectedPassword) {
      throw new ForbiddenException('删除密码不正确');
    }

    const project = await this.resolveProjectByIdentifier(identifier);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectFolder = await this.resolveProjectFolder(identifier);
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
