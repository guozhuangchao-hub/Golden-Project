require('dotenv/config');

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  PrismaClient,
  ProjectStatus,
  ModuleStatus,
  UserStatus,
  MemberRole,
  MemberStatus,
  TaskStatus,
  TaskPriority,
  TaskLogAction,
} = require('@prisma/client');

const prisma = new PrismaClient();

const ROOT_DIR = path.join(process.cwd(), '项目列表');
const META_FILE_NAME = 'project.meta.json';
const WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xls']);
const TEMPLATE_FOLDER_NAME = '项目模板';
const INITIAL_DOCS_FOLDER_NAME = '初始文档';
const IMPORT_USER_EMAIL = 'system-import@golden.local';
const IMPORT_SCRIPT = path.join(process.cwd(), 'scripts', 'import-project-intake-xlsx.py');

const statusMap = {
  planning: ProjectStatus.DRAFT,
  draft: ProjectStatus.DRAFT,
  筹备中: ProjectStatus.DRAFT,
  规划中: ProjectStatus.DRAFT,
  active: ProjectStatus.ACTIVE,
  进行中: ProjectStatus.ACTIVE,
  completed: ProjectStatus.COMPLETED,
  已完成: ProjectStatus.COMPLETED,
  cancelled: ProjectStatus.CANCELLED,
  已取消: ProjectStatus.CANCELLED,
};

const memberRoleMap = {
  核心: MemberRole.LEADER,
  普通: MemberRole.EXECUTOR,
  admin: MemberRole.ADMIN,
  leader: MemberRole.LEADER,
  executor: MemberRole.EXECUTOR,
  temp: MemberRole.TEMP,
};

const taskStatusMap = {
  planning: TaskStatus.PENDING_CONFIRMATION,
  pending: TaskStatus.PENDING_CONFIRMATION,
  待确认: TaskStatus.PENDING_CONFIRMATION,
  已确认: TaskStatus.CONFIRMED,
  confirmed: TaskStatus.CONFIRMED,
  执行中: TaskStatus.IN_PROGRESS,
  进行中: TaskStatus.IN_PROGRESS,
  in_progress: TaskStatus.IN_PROGRESS,
  已完成: TaskStatus.COMPLETED,
  completed: TaskStatus.COMPLETED,
  已逾期: TaskStatus.OVERDUE,
  overdue: TaskStatus.OVERDUE,
  已取消: TaskStatus.CANCELLED,
  cancelled: TaskStatus.CANCELLED,
  准备中: TaskStatus.CONFIRMED,
  初稿: TaskStatus.PENDING_CONFIRMATION,
  已完成初稿: TaskStatus.CONFIRMED,
  动态调整: TaskStatus.IN_PROGRESS,
};

const taskPriorityMap = {
  low: TaskPriority.LOW,
  低: TaskPriority.LOW,
  medium: TaskPriority.MEDIUM,
  中: TaskPriority.MEDIUM,
  普通: TaskPriority.MEDIUM,
  high: TaskPriority.HIGH,
  高: TaskPriority.HIGH,
  urgent: TaskPriority.URGENT,
  紧急: TaskPriority.URGENT,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findProjectFolders(dirPath) {
  const results = new Set();
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === TEMPLATE_FOLDER_NAME || entry.name === INITIAL_DOCS_FOLDER_NAME) {
        continue;
      }

      for (const child of findProjectFolders(fullPath)) {
        results.add(child);
      }
      continue;
    }

    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (entry.name === META_FILE_NAME || WORKBOOK_EXTENSIONS.has(ext)) {
        results.add(path.dirname(fullPath));
      }
    }
  }

  return [...results];
}

function normalizeStatus(rawStatus) {
  if (!rawStatus) {
    return ProjectStatus.DRAFT;
  }

  return statusMap[String(rawStatus).trim().toLowerCase()] ?? ProjectStatus.DRAFT;
}

function normalizeMemberRole(rawRole) {
  if (!rawRole) {
    return MemberRole.EXECUTOR;
  }

  return memberRoleMap[String(rawRole).trim().toLowerCase()] ?? memberRoleMap[String(rawRole).trim()] ?? MemberRole.EXECUTOR;
}

function normalizeTaskStatus(rawStatus) {
  if (!rawStatus) {
    return TaskStatus.PENDING_CONFIRMATION;
  }

  return (
    taskStatusMap[String(rawStatus).trim().toLowerCase()] ??
    taskStatusMap[String(rawStatus).trim()] ??
    TaskStatus.PENDING_CONFIRMATION
  );
}

function normalizeTaskPriority(rawPriority) {
  if (!rawPriority) {
    return TaskPriority.MEDIUM;
  }

  return (
    taskPriorityMap[String(rawPriority).trim().toLowerCase()] ??
    taskPriorityMap[String(rawPriority).trim()] ??
    TaskPriority.MEDIUM
  );
}

function normalizeModuleStatus(projectStatus) {
  switch (projectStatus) {
    case ProjectStatus.ACTIVE:
      return ModuleStatus.ACTIVE;
    case ProjectStatus.COMPLETED:
      return ModuleStatus.COMPLETED;
    case ProjectStatus.CANCELLED:
      return ModuleStatus.CANCELLED;
    default:
      return ModuleStatus.PENDING;
  }
}

function normalizeDate(rawValue) {
  if (!rawValue) {
    return undefined;
  }

  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function splitMultiValue(rawValue) {
  if (!rawValue) {
    return [];
  }

  return String(rawValue)
    .split(/[\n/、,，；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugifyToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
}

function buildSyntheticEmail(projectCode, name) {
  return `${slugifyToken(projectCode || 'golden-project')}-${slugifyToken(name)}@project.local`;
}

async function ensureProjectUser({ projectCode, name, mobile, feishuId, roleHint, title }) {
  if (!name) {
    return null;
  }

  const trimmedName = String(name).trim();
  const trimmedMobile = mobile ? String(mobile).trim() : null;
  const trimmedFeishuId = feishuId ? String(feishuId).trim() : null;
  const syntheticEmail = buildSyntheticEmail(projectCode, trimmedName);

  let existingUser = null;

  if (trimmedFeishuId) {
    existingUser = await prisma.user.findUnique({
      where: { feishuUserId: trimmedFeishuId },
    });
  }

  if (!existingUser && trimmedMobile) {
    existingUser = await prisma.user.findUnique({
      where: { mobile: trimmedMobile },
    });
  }

  if (!existingUser) {
    existingUser = await prisma.user.findUnique({
      where: { email: syntheticEmail },
    });
  }

  const data = {
    name: trimmedName,
    mobile: trimmedMobile,
    email: syntheticEmail,
    feishuUserId: trimmedFeishuId,
    status: UserStatus.ACTIVE,
    isTemporary: roleHint === MemberRole.TEMP,
    remark: title ? `来源录入模板：${title}` : '来源录入模板',
  };

  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data,
    });
  }

  return prisma.user.create({ data });
}

async function syncProjectMembers(project, meta) {
  const memberMap = new Map();

  const pushMember = (item) => {
    if (!item?.name) {
      return;
    }
    const key = item.name.trim();
    if (!key) {
      return;
    }

    const existing = memberMap.get(key);
    if (!existing) {
      memberMap.set(key, item);
      return;
    }

    if (item.role === MemberRole.ADMIN || existing.role !== MemberRole.ADMIN) {
      existing.role = item.role || existing.role;
    }
    existing.title = existing.title || item.title;
    existing.mobile = existing.mobile || item.mobile;
    existing.feishuId = existing.feishuId || item.feishuId;
    existing.remark = existing.remark || item.remark;
  };

  if (meta.projectManager) {
    pushMember({
      name: meta.projectManager,
      role: MemberRole.ADMIN,
      title: '项目经理',
      remark: '来源：基础信息',
    });
  }

  for (const moduleDetail of meta.moduleDetails || []) {
    if (!moduleDetail?.owner) {
      continue;
    }
    for (const owner of splitMultiValue(moduleDetail.owner)) {
      pushMember({
        name: owner,
        role: MemberRole.LEADER,
        title: `${moduleDetail.name}负责人`,
        remark: '来源：模块规划',
      });
    }
  }

  for (const contact of meta.departmentContacts || []) {
    for (const name of splitMultiValue(contact.contact)) {
      pushMember({
        name,
        role: normalizeMemberRole(contact.level),
        title: contact.role || '项目联系人',
        mobile: contact.mobile,
        feishuId: contact.feishuId,
        remark: `来源：${contact.unit || '责任单位与联系人'}`,
      });
    }
  }

  for (const task of meta.taskDrafts || []) {
    for (const owner of splitMultiValue(task.owner)) {
      pushMember({
        name: owner,
        role: MemberRole.LEADER,
        title: `${task.module || '项目'}任务负责人`,
        remark: '来源：前期任务负责人',
      });
    }

    for (const assistant of splitMultiValue(task.assistant)) {
      pushMember({
        name: assistant,
        role: MemberRole.EXECUTOR,
        title: `${task.module || '项目'}协助人`,
        remark: '来源：前期任务协助人',
      });
    }
  }

  const syncedMembers = [];
  for (const member of memberMap.values()) {
    const user = await ensureProjectUser({
      projectCode: project.code || project.name,
      name: member.name,
      mobile: member.mobile,
      feishuId: member.feishuId,
      roleHint: member.role,
      title: member.title,
    });

    if (!user) {
      continue;
    }

    const projectMember = await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: user.id,
        },
      },
      update: {
        role: member.role,
        title: member.title || null,
        status: MemberStatus.ACTIVE,
        remark: member.remark || null,
      },
      create: {
        projectId: project.id,
        userId: user.id,
        role: member.role,
        title: member.title || null,
        status: MemberStatus.ACTIVE,
        remark: member.remark || null,
      },
      include: {
        user: true,
      },
    });

    syncedMembers.push(projectMember);
  }

  return syncedMembers;
}

async function syncModuleLeaders(projectId, meta, modules, members) {
  const moduleMap = new Map(modules.map((module) => [module.name, module]));
  const memberMap = new Map(members.map((member) => [member.user.name, member]));

  for (const detail of meta.moduleDetails || []) {
    const projectModule = moduleMap.get(detail.name);
    if (!projectModule || !detail.owner) {
      continue;
    }

    const firstOwner = splitMultiValue(detail.owner)[0];
    const leaderMember = memberMap.get(firstOwner);
    if (!leaderMember) {
      continue;
    }

    await prisma.projectModule.update({
      where: { id: projectModule.id },
      data: { leaderMemberId: leaderMember.id },
    });
  }
}

async function syncProjectTasks(project, meta, modules, members, importUserId) {
  const moduleMap = new Map(modules.map((module) => [module.name, module]));
  const memberMap = new Map(members.map((member) => [member.user.name, member]));
  const syncedTasks = [];

  for (const [index, draft] of (meta.taskDrafts || []).entries()) {
    if (!draft?.content) {
      continue;
    }

    const ownerName = splitMultiValue(draft.owner)[0] || null;
    const assistantName = splitMultiValue(draft.assistant)[0] || null;
    const ownerMember = ownerName ? memberMap.get(ownerName) : null;
    const assistantMember = assistantName ? memberMap.get(assistantName) : null;
    const module = draft.module ? moduleMap.get(draft.module) : null;

    const taskData = {
      moduleId: module?.id ?? null,
      description: draft.remark || null,
      status: normalizeTaskStatus(draft.status),
      priority: normalizeTaskPriority(draft.priority),
      ownerId: ownerMember?.userId ?? null,
      ownerMemberId: ownerMember?.id ?? null,
      assistantId: assistantMember?.userId ?? null,
      assistantMemberId: assistantMember?.id ?? null,
      startTime: normalizeDate(draft.startTime),
      dueTime: normalizeDate(draft.dueTime),
      sortOrder: index + 1,
      createdById: importUserId,
      confirmedAt:
        normalizeTaskStatus(draft.status) === TaskStatus.CONFIRMED ||
        normalizeTaskStatus(draft.status) === TaskStatus.IN_PROGRESS ||
        normalizeTaskStatus(draft.status) === TaskStatus.COMPLETED
          ? new Date()
          : null,
      completedAt:
        normalizeTaskStatus(draft.status) === TaskStatus.COMPLETED ? new Date() : null,
      cancelledAt:
        normalizeTaskStatus(draft.status) === TaskStatus.CANCELLED ? new Date() : null,
    };

    const existingTask = await prisma.task.findFirst({
      where: {
        projectId: project.id,
        title: draft.content,
      },
    });

    const task = existingTask
      ? await prisma.task.update({
          where: { id: existingTask.id },
          data: taskData,
        })
      : await prisma.task.create({
          data: {
            projectId: project.id,
            title: draft.content,
            ...taskData,
          },
        });

    if (!existingTask) {
      await prisma.taskLog.create({
        data: {
          taskId: task.id,
          action: TaskLogAction.CREATED,
          operatorId: importUserId,
          toStatus: task.status,
          content: '由前期录入模板同步生成',
        },
      });
    }

    syncedTasks.push(task);
  }

  return syncedTasks;
}

function buildDescription(meta, folderName) {
  const parts = [];

  if (meta.projectDescription) {
    parts.push(meta.projectDescription);
  }

  if (meta.projectType) {
    parts.push(`项目类型：${meta.projectType}`);
  }

  if (meta.projectManager) {
    parts.push(`项目经理：${meta.projectManager}`);
  }

  if (meta.summary?.activityCount) {
    parts.push(`主要活动数：${meta.summary.activityCount}`);
  }

  if (meta.summary?.taskItemCount) {
    parts.push(`筹备事项数：${meta.summary.taskItemCount}`);
  }

  if (meta.sourceDocument?.title) {
    parts.push(`来源文档：${meta.sourceDocument.title}`);
  }

  parts.push(`来源目录：${folderName}`);

  if (Array.isArray(meta.primaryActivities) && meta.primaryActivities.length > 0) {
    parts.push(`关键活动：${meta.primaryActivities.slice(0, 5).join('、')}`);
  }

  return parts.join(' | ');
}

function findWorkbookFile(folderPath) {
  const candidates = fs
    .readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && !name.startsWith('~$'))
    .filter((name) => WORKBOOK_EXTENSIONS.has(path.extname(name).toLowerCase()));

  if (candidates.length === 0) {
    return null;
  }

  const preferred = candidates.find((name) => name === '前期录入模板.xlsx');
  return path.join(folderPath, preferred ?? candidates[0]);
}

function ensureProjectMeta(folderPath) {
  const metaPath = path.join(folderPath, META_FILE_NAME);
  if (fs.existsSync(metaPath)) {
    return metaPath;
  }

  const workbookPath = findWorkbookFile(folderPath);
  if (!workbookPath) {
    return null;
  }

  execFileSync('python3', [IMPORT_SCRIPT, workbookPath, '--output-meta', metaPath], {
    stdio: 'inherit',
  });

  return metaPath;
}

async function ensureImportUser() {
  const existingUser = await prisma.user.findUnique({
    where: { email: IMPORT_USER_EMAIL },
  });

  if (existingUser) {
    return existingUser;
  }

  return prisma.user.create({
    data: {
      name: '系统导入',
      email: IMPORT_USER_EMAIL,
      status: UserStatus.ACTIVE,
      remark: '用于项目文件夹自动同步入库的系统账号',
    },
  });
}

async function syncProjectMeta(metaPath, importUserId) {
  const meta = readJson(metaPath);
  const folderName = path.basename(path.dirname(metaPath));
  const projectCode = meta.projectCode || null;
  const projectName = meta.projectName || folderName;
  const projectByCode = projectCode
    ? await prisma.project.findUnique({
        where: { code: projectCode },
      })
    : null;
  const projectsByName = await prisma.project.findMany({
    where: { name: projectName },
    orderBy: { createdAt: 'asc' },
  });
  const existingProject = projectByCode ?? projectsByName[0] ?? null;

  const data = {
    name: projectName,
    code: projectCode,
    description: buildDescription(meta, folderName),
    status: normalizeStatus(meta.projectStatus),
    location:
      meta.city ||
      (Array.isArray(meta.primaryVenues) && meta.primaryVenues.length > 0
        ? meta.primaryVenues[0]
        : null),
    startDate: normalizeDate(meta.dateRange?.start),
    endDate: normalizeDate(meta.dateRange?.end),
    createdById: existingProject?.createdById ?? importUserId,
  };

  if (existingProject) {
    const updatedProject = await prisma.project.update({
      where: { id: existingProject.id },
      data,
    });

    const modules = await syncProjectModules(updatedProject.id, meta, data.status);
    const members = await syncProjectMembers(updatedProject, meta);
    await syncModuleLeaders(updatedProject.id, meta, modules, members);
    const tasks = await syncProjectTasks(updatedProject, meta, modules, members, importUserId);

    return {
      action: 'updated',
      project: updatedProject,
      modules,
      members,
      tasks,
      metaPath,
    };
  }

  const createdProject = await prisma.project.create({
    data,
  });

  const modules = await syncProjectModules(createdProject.id, meta, data.status);
  const members = await syncProjectMembers(createdProject, meta);
  await syncModuleLeaders(createdProject.id, meta, modules, members);
  const tasks = await syncProjectTasks(createdProject, meta, modules, members, importUserId);

  return {
    action: 'created',
    project: createdProject,
    modules,
    members,
    tasks,
    metaPath,
  };
}

async function syncProjectModules(projectId, meta, projectStatus) {
  const recommendedModules = Array.isArray(meta.recommendedModules)
    ? meta.recommendedModules.filter(Boolean)
    : [];
  const moduleDetails = Array.isArray(meta.moduleDetails) ? meta.moduleDetails : [];

  if (recommendedModules.length === 0) {
    return [];
  }

  const syncedModules = [];

  for (const [index, moduleName] of recommendedModules.entries()) {
    const matchedDetail =
      moduleDetails.find((item) => item && item.name === moduleName) ?? null;

    const moduleData = {
      description: matchedDetail?.description ?? null,
      sortOrder: index + 1,
      status: normalizeModuleStatus(projectStatus),
      startDate: normalizeDate(matchedDetail?.startDate),
      endDate: normalizeDate(matchedDetail?.endDate),
    };

    const projectModule = await prisma.projectModule.upsert({
      where: {
        projectId_name: {
          projectId,
          name: moduleName,
        },
      },
      update: moduleData,
      create: {
        projectId,
        name: moduleName,
        ...moduleData,
      },
    });

    syncedModules.push(projectModule);
  }

  return syncedModules;
}

async function main() {
  if (!fs.existsSync(ROOT_DIR)) {
    throw new Error(`Project root not found: ${ROOT_DIR}`);
  }

  const importUser = await ensureImportUser();
  const projectFolders = findProjectFolders(ROOT_DIR);

  if (projectFolders.length === 0) {
    console.log('No project folders found.');
    return;
  }

  const results = [];
  for (const folderPath of projectFolders) {
    const metaFile = ensureProjectMeta(folderPath);
    if (!metaFile) {
      continue;
    }

    const result = await syncProjectMeta(metaFile, importUser.id);
    results.push(result);
  }

  console.log(`Scanned project folders: ${projectFolders.length}`);
  for (const result of results) {
    console.log(
      `${result.action.toUpperCase()}: ${result.project.name} (${result.project.code ?? 'NO_CODE'})`,
    );
    if (result.modules?.length) {
      console.log(`  modules synced: ${result.modules.length}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
