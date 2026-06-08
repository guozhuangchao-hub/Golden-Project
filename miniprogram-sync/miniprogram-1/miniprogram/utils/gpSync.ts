import { getOverallProgress, gpDemoData, getTaskProgress, GpTask, priorityNameMap, statusNameMap, TaskPriority, TaskStatus } from './gpDemoData'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3001/api'
const DEFAULT_PROJECT_ID = gpDemoData.project.id
const DEFAULT_PROJECT_CODE = gpDemoData.project.code
const AGENT_PROVIDER = 'codex'
const STORAGE_KEY = 'gp-runtime-config'

export type SyncProject = {
  id: string
  code: string
  name: string
  location: string
  progress: number
  activeTasks: number
  teamCount: number
  pendingTasks: number
  allPendingTasks: number
  alertCount: number
  latestTask: string
}

export type RuntimeConfig = {
  apiBaseUrl: string
  projectId: string
  projectCode: string
  memberId: string
  memberName: string
}

export type SyncTask = {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: 'MEDIUM' | 'HIGH' | 'URGENT'
  owner: string
  ownerId?: string
  ownerMemberId?: string
  assistant?: string
  assistantId?: string
  assistantMemberId?: string
  module: string
  startTime: string
  dueTime: string
}

export type IncomingTaskView = {
  id: string
  title: string
  from: string
  due: string
  module: string
  priority: string
  recipients: string
}

export type SyncNotification = {
  id: string
  taskId: string
  title: string
  project: string
  source: string
  priority: string
  due: string
  status: string
}

export type MyTaskView = {
  id: string
  title: string
  owner: string
  progress: number
  status: string
  module: string
  due: string
  priority: string
}

export type SyncProjectContact = {
  memberId: string
  userId?: string
  name: string
  role: string
  title?: string
  phone: string
}

export type SyncProjectDetail = {
  project: {
    id: string
    code: string
    name: string
    status: string
    location: string
    dateRange: string
    description: string
  }
  progress: number
  structure: Array<{
    id: string
    name: string
    description: string
    leader: string
    status: string
  }>
  contacts: SyncProjectContact[]
  moduleCount: number
  taskCount: number
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH'
  data?: AnyObject
}

const safeStorageGet = <T>(key: string): T | null => {
  try {
    return (wx.getStorageSync(key) || null) as T | null
  } catch (_error) {
    return null
  }
}

const safeStorageSet = (key: string, value: unknown) => {
  try {
    wx.setStorageSync(key, value)
  } catch (_error) {
    // ignore storage failures in preview mode
  }
}

export const getRuntimeConfig = (): RuntimeConfig => {
  const stored = safeStorageGet<Partial<RuntimeConfig>>(STORAGE_KEY) || {}
  return {
    apiBaseUrl: String(stored.apiBaseUrl || DEFAULT_API_BASE_URL),
    projectId: String(stored.projectId || DEFAULT_PROJECT_ID),
    projectCode: String(stored.projectCode || DEFAULT_PROJECT_CODE),
    memberId: String(stored.memberId || ''),
    memberName: String(stored.memberName || ''),
  }
}

export const setRuntimeConfig = (patch: Partial<RuntimeConfig>) => {
  const next = {
    ...getRuntimeConfig(),
    ...patch,
  }
  safeStorageSet(STORAGE_KEY, next)
  return next
}

const getApiBaseUrl = () => getRuntimeConfig().apiBaseUrl || DEFAULT_API_BASE_URL

const request = <T>(path: string, options: RequestOptions = {}) => new Promise<T>((resolve, reject) => {
  wx.request({
    url: `${getApiBaseUrl()}${path}`,
    method: (options.method || 'GET') as any,
    data: options.data,
    timeout: 8000,
    success: (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data as T)
        return
      }

      const payload = res.data as AnyObject
      const message = Array.isArray(payload?.message) ? payload.message.join('，') : payload?.message
      reject(new Error(String(message || `GP API ${res.statusCode}`)))
    },
    fail: (error) => {
      reject(error)
    },
  })
})

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = Object.entries(params)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  return search ? `?${search}` : ''
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '未排期'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}.${month}.${day} ${hour}:${minute}`
}

const formatDateRange = (startTime?: string | null, endTime?: string | null) => {
  if (!startTime && !endTime) return '未设置时间'
  if (startTime && endTime) return `${formatDateTime(startTime)} - ${formatDateTime(endTime)}`
  return startTime ? `${formatDateTime(startTime)} 开始` : `${formatDateTime(endTime)} 截止`
}

const normalizePriority = (priority: string | null | undefined): TaskPriority => {
  if (priority === 'HIGH' || priority === 'URGENT') return priority
  return 'MEDIUM'
}

const mapLiveTask = (task: any): SyncTask => ({
  id: String(task.id || ''),
  title: String(task.title || '未命名任务'),
  description: task.description || '',
  status: (task.status || 'PENDING_CONFIRMATION') as TaskStatus,
  priority: normalizePriority(task.priority),
  owner: String(task.owner?.name || task.ownerName || '待指定'),
  ownerId: String(task.owner?.id || task.ownerId || ''),
  ownerMemberId: String(task.ownerMemberId || ''),
  assistant: task.assistant?.name || task.assistantName || '',
  assistantId: String(task.assistant?.id || task.assistantId || ''),
  assistantMemberId: String(task.assistantMemberId || ''),
  module: String(task.module?.name || task.moduleName || '未分组'),
  startTime: formatDateTime(task.startTime),
  dueTime: formatDateTime(task.dueTime),
})

const mapLiveNotification = (notification: any): SyncNotification => {
  const task = notification.task || {}
  const project = notification.project || {}
  const priority = normalizePriority(task.priority)
  const sourcePayload = notification.source || notification.payload || {}
  const sourceName = sourcePayload?.source === 'dashboard_task_publish'
    ? '后台发布 · 小程序通知'
    : sourcePayload?.source === 'dashboard'
      ? '指挥台同步'
      : '小程序通知队列'

  return {
    id: String(notification.id || task.id || ''),
    taskId: String(notification.taskId || task.id || ''),
    title: String(task.title || notification.title || '新的任务待确认'),
    project: String(project.name || notification.projectName || '当前项目'),
    source: sourceName,
    priority: priorityNameMap[priority] || '普通',
    due: formatDateTime(task.dueTime),
    status: String(task.status || notification.status || 'PENDING_CONFIRMATION'),
  }
}

const mapDemoTask = (task: GpTask): SyncTask => ({ ...task })

const getCountByStatus = (taskStats: Array<{ status: string; _count?: { _all?: number } }>, statuses: string[]) => {
  return taskStats
    .filter((item) => statuses.includes(item.status))
    .reduce((sum, item) => sum + Number(item._count?._all || 0), 0)
}

const matchesMember = (task: SyncTask, memberId?: string) => {
  if (!memberId) return true
  return [task.ownerMemberId, task.assistantMemberId, task.ownerId, task.assistantId].includes(memberId)
}

export const toIncomingTaskView = (task: SyncTask): IncomingTaskView => ({
  id: task.id,
  title: task.title,
  from: task.owner,
  due: task.dueTime,
  module: task.module,
  priority: priorityNameMap[task.priority],
  recipients: task.assistant || task.owner,
})

export const toMyTaskView = (task: SyncTask): MyTaskView => ({
  id: task.id,
  title: task.title,
  owner: task.owner,
  progress: getTaskProgress(task.status),
  status: statusNameMap[task.status] || task.status,
  module: task.module,
  due: task.dueTime,
  priority: priorityNameMap[task.priority],
})

export const getFallbackProjects = (): SyncProject[] => [
  {
    id: DEFAULT_PROJECT_ID,
    code: gpDemoData.project.code,
    name: gpDemoData.project.name,
    location: gpDemoData.project.location,
    progress: getOverallProgress(),
    activeTasks: gpDemoData.taskStats.inProgress,
    teamCount: gpDemoData.contacts.length,
    pendingTasks: gpDemoData.taskStats.pending,
    allPendingTasks: 21,
    alertCount: gpDemoData.pendingEvents.length,
    latestTask: gpDemoData.pendingEvents[0].title,
  },
  {
    id: '2026JZGJXGYGMHBGXLT20260602YHGG',
    code: '2026JZGJXGYGMHBGXLT20260602YHGG',
    name: '2026金砖国家新工业革命伙伴关系论坛',
    location: '厦门国际会议中心',
    progress: 64,
    activeTasks: 14,
    teamCount: 18,
    pendingTasks: 5,
    allPendingTasks: 21,
    alertCount: 1,
    latestTask: 'AI识别：接待车辆排班需要复核',
  },
  {
    id: '2026SBH20260602YHGG',
    code: '2026SBH20260602YHGG',
    name: '2026食博会',
    location: '上海新国际博览中心',
    progress: 48,
    activeTasks: 26,
    teamCount: 31,
    pendingTasks: 7,
    allPendingTasks: 21,
    alertCount: 2,
    latestTask: 'AI待确认：供应商进场证缺口',
  },
]

export const fetchProjects = async () => {
  try {
    const projects = await request<any[]>('/projects')
    if (!Array.isArray(projects) || !projects.length) return getFallbackProjects()
    const fallbackByCode = new Map(getFallbackProjects().map((item) => [item.code, item]))
    return projects.map((project) => {
      const code = String(project.code || project.projectCode || project.id || '')
      const fallback = fallbackByCode.get(code)
      return {
        id: String(project.id || code),
        code,
        name: String(project.name || fallback?.name || '未命名项目'),
        location: String(project.location || fallback?.location || '待填写地点'),
        progress: fallback?.progress || 0,
        activeTasks: fallback?.activeTasks || 0,
        teamCount: Number(project.members?.length || fallback?.teamCount || 0),
        pendingTasks: fallback?.pendingTasks || 0,
        allPendingTasks: fallback?.allPendingTasks || 0,
        alertCount: fallback?.alertCount || 0,
        latestTask: fallback?.latestTask || '暂无新任务提醒',
      } as SyncProject
    })
  } catch (_error) {
    return getFallbackProjects()
  }
}

export const fetchProjectDashboardSummary = async (projectId: string) => {
  try {
    const dashboard = await request<any>(`/projects/${projectId}/dashboard`)
    const project = dashboard?.project || {}
    const taskStats = Array.isArray(dashboard?.taskStats) ? dashboard.taskStats : []
    const activeTasks = getCountByStatus(taskStats, ['CONFIRMED', 'IN_PROGRESS', 'OVERDUE'])
    const pendingTasks = getCountByStatus(taskStats, ['PENDING_CONFIRMATION'])
    const completedTasks = getCountByStatus(taskStats, ['COMPLETED'])
    const totalTasks = activeTasks + pendingTasks + completedTasks
    const progress = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0
    const pendingEvents = Array.isArray(dashboard?.pendingEvents) ? dashboard.pendingEvents : []
    const riskItems = Array.isArray(dashboard?.riskItems) ? dashboard.riskItems : []

    return {
      id: String(project.id || projectId),
      code: String(project.code || projectId),
      name: String(project.name || '未命名项目'),
      location: String(project.location || '待填写地点'),
      progress,
      activeTasks,
      teamCount: Array.isArray(project.members) ? project.members.length : 0,
      pendingTasks,
      allPendingTasks: pendingTasks,
      alertCount: riskItems.length || pendingEvents.length,
      latestTask: pendingEvents[0]?.title || riskItems[0]?.title || '暂无新任务提醒',
    } as SyncProject
  } catch (_error) {
    return null
  }
}

export const fetchProjectContacts = async (projectId: string): Promise<SyncProjectContact[]> => {
  try {
    const dashboard = await request<any>(`/projects/${projectId}/dashboard`)
    const members = Array.isArray(dashboard?.project?.members) ? dashboard.project.members : []
    return members.map((member: any) => ({
      memberId: String(member.id || ''),
      userId: String(member.user?.id || member.userId || ''),
      name: String(member.user?.name || '未命名成员'),
      role: String(member.title || member.role || '未设置岗位'),
      title: String(member.title || ''),
      phone: String(member.user?.mobile || ''),
    }))
  } catch (_error) {
    return gpDemoData.contacts.map((contact) => ({
      memberId: contact.phone,
      name: contact.name,
      role: contact.role,
      phone: contact.phone,
    }))
  }
}

export const fetchProjectDetail = async (projectId: string): Promise<SyncProjectDetail> => {
  try {
    const dashboard = await request<any>(`/projects/${projectId}/dashboard`)
    const project = dashboard?.project || {}
    const modules = Array.isArray(project.modules) ? project.modules : []
    const tasks = Array.isArray(dashboard?.tasks) ? dashboard.tasks : []
    const completed = tasks.filter((item: any) => item.status === 'COMPLETED').length
    const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
    const members = Array.isArray(project.members) ? project.members : []

    return {
      project: {
        id: String(project.id || projectId),
        code: String(project.code || projectId),
        name: String(project.name || '未命名项目'),
        status: String(project.status || 'ACTIVE'),
        location: String(project.location || '待填写地点'),
        dateRange: formatDateRange(project.startDate, project.endDate),
        description: String(project.description || '暂无项目说明'),
      },
      progress,
      structure: modules.map((module: any) => ({
        id: String(module.id || ''),
        name: String(module.name || '未命名模块'),
        description: String(module.description || '暂无模块说明'),
        leader: String(module.leaderMember?.user?.name || '待指定'),
        status: String(module.status || 'PENDING'),
      })),
      contacts: members.map((member: any) => ({
        memberId: String(member.id || ''),
        userId: String(member.user?.id || member.userId || ''),
        name: String(member.user?.name || '未命名成员'),
        role: String(member.title || member.role || '未设置岗位'),
        title: String(member.title || ''),
        phone: String(member.user?.mobile || ''),
      })),
      moduleCount: modules.length,
      taskCount: tasks.length,
    }
  } catch (_error) {
    return {
      project: gpDemoData.project,
      progress: getOverallProgress(),
      structure: gpDemoData.modules,
      contacts: gpDemoData.contacts.map((item) => ({
        memberId: item.phone,
        name: item.name,
        role: item.role,
        phone: item.phone,
      })),
      moduleCount: gpDemoData.modules.length,
      taskCount: gpDemoData.tasks.length,
    }
  }
}

export const fetchTasks = async (projectId: string, memberId?: string) => {
  if (memberId) {
    try {
      const tasks = await request<any[]>(`/mini/me/tasks${buildQuery({ memberId, projectId })}`)
      if (Array.isArray(tasks)) {
        return tasks.map(mapLiveTask)
      }
    } catch (_error) {
      // fallback to generic task list below
    }
  }

  try {
    const tasks = await request<any[]>(`/projects/${projectId}/tasks`)
    const mapped = Array.isArray(tasks) ? tasks.map(mapLiveTask) : gpDemoData.tasks.map(mapDemoTask)
    return memberId ? mapped.filter((task) => matchesMember(task, memberId)) : mapped
  } catch (_error) {
    const fallback = gpDemoData.tasks.map(mapDemoTask)
    return memberId ? fallback.filter((task) => matchesMember(task, memberId)) : fallback
  }
}

export const fetchNotifications = async (projectId: string) => {
  try {
    const notifications = await request<any[]>(`/projects/${projectId}/notifications`)
    if (!Array.isArray(notifications)) return [] as SyncNotification[]
    return notifications.map(mapLiveNotification)
  } catch (_error) {
    return [] as SyncNotification[]
  }
}

export const confirmTask = async (taskId: string, memberId: string, projectId: string, content: string) => {
  try {
    await request(`/mini/tasks/${taskId}/confirm`, {
      method: 'POST',
      data: { memberId, content },
    })
    return true
  } catch (_error) {
    try {
      await request(`/projects/${projectId}/tasks/${taskId}/confirm`, {
        method: 'POST',
        data: { toStatus: 'CONFIRMED', content },
      })
      return true
    } catch (_secondError) {
      return false
    }
  }
}

export const rejectTask = async (taskId: string, memberId: string, projectId: string, content: string) => {
  try {
    await request(`/projects/${projectId}/tasks/${taskId}/status`, {
      method: 'PATCH',
      data: { toStatus: 'CANCELLED', content, memberId },
    })
    return true
  } catch (_error) {
    return false
  }
}

export const submitTaskProgress = async (
  taskId: string,
  memberId: string,
  projectId: string,
  progressPercent: number,
  content: string,
) => {
  try {
    await request(`/mini/tasks/${taskId}/progress`, {
      method: 'POST',
      data: { memberId, progressPercent, content },
    })
    return true
  } catch (_error) {
    try {
      const toStatus: TaskStatus = progressPercent >= 100 ? 'COMPLETED' : 'IN_PROGRESS'
      const path = toStatus === 'COMPLETED'
        ? `/projects/${projectId}/tasks/${taskId}/complete`
        : `/projects/${projectId}/tasks/${taskId}/start`
      await request(path, {
        method: 'POST',
        data: { memberId, content, toStatus },
      })
      return true
    } catch (_secondError) {
      return false
    }
  }
}

export const requestTaskHelp = async (
  taskId: string,
  memberId: string,
  projectId: string,
  content: string,
  provider = AGENT_PROVIDER,
) => {
  try {
    return await request<{ advice?: { reply?: string }; reply?: string }>(`/mini/tasks/${taskId}/help`, {
      method: 'POST',
      data: { memberId, content, provider },
    })
  } catch (_error) {
    return askProjectAgent(projectId, `我在任务 ${taskId} 上需要帮助：${content}`)
  }
}

export const createTask = async (projectId: string, payload: { title: string; description?: string; priority?: 'MEDIUM' | 'HIGH' | 'URGENT'; dueTime?: string }) => {
  try {
    return await request(`/projects/${projectId}/tasks`, {
      method: 'POST',
      data: payload,
    })
  } catch (_error) {
    return null
  }
}

export const askProjectAgent = async (projectId: string, message: string) => {
  try {
    return await request<{ reply: string }>(`/integrations/agents/projects/${projectId}/customer-service/chat`, {
      method: 'POST',
      data: {
        provider: AGENT_PROVIDER,
        sessionId: 'mini-ai',
        includeProjectContext: true,
        message,
      },
    })
  } catch (_error) {
    return {
      reply: '当前未连接到实时 Agent，先检查本地后端是否启动，或确认项目 ID 是否正确。',
    }
  }
}
