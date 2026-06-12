import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { access, readdir, readFile, stat } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { basename, extname, isAbsolute, join, normalize, relative } from 'path';
import { execFile } from 'child_process';
import { pathToFileURL } from 'url';
import { PrismaService } from '../../prisma/prisma.service';

type ProjectFolderMeta = {
  projectName?: string;
  projectCode?: string;
  folderName?: string;
  intakeWorkbook?: { fileName?: string };
};

type ProjectFolderRecord = {
  folderPath: string;
  metaPath: string;
  meta: ProjectFolderMeta;
};

type ProjectWorkbookRecord = {
  folderPath: string;
  workbookPath: string;
  workbookName: string;
};

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
export class ProjectFilesService {
  private readonly projectRoot = join(process.cwd(), '项目列表');
  private readonly hiddenFileNames = new Set(['.DS_Store', 'project.meta.json']);

  constructor(private readonly prisma: PrismaService) {}

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

  async resolveProjectFolder(identifier: string): Promise<ProjectFolderRecord | null> {
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
        const meta = JSON.parse(rawMeta) as ProjectFolderMeta;

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

  private async resolveProjectWorkbook(identifier: string): Promise<ProjectWorkbookRecord | null> {
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

  private async scanProjectFiles(
    folderPath: string,
    currentPath = folderPath,
  ): Promise<ProjectFileItem[]> {
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
}
