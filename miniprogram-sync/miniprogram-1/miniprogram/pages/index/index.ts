import {
  fetchNotifications,
  fetchProjectDashboardSummary,
  fetchProjects,
  getFallbackProjects,
  getRuntimeConfig,
  setRuntimeConfig,
  SyncNotification,
  SyncProject,
} from '../../utils/gpSync'

type NotificationTask = {
  id?: string
  taskId?: string
  title: string
  project: string
  source: string
  priority: string
  due: string
}

const projectOptions = getFallbackProjects()

const allNotificationTasks: NotificationTask[] = [
  {
    title: '确认舞台彩排提前后的灯光音响到场',
    project: '2026 上海新品发布会',
    source: 'AI识别 · 飞书',
    priority: '高优先级',
    due: '2026.06.02 15:00',
  },
]

Component({
  data: {
    projectOptions,
    selectedProjectId: projectOptions[0].id,
    selectedProjectCode: projectOptions[0].code,
    showProjectSelector: false,
    projectName: projectOptions[0].name,
    projectLocation: projectOptions[0].location,
    progress: projectOptions[0].progress,
    activeTasks: projectOptions[0].activeTasks,
    teamCount: projectOptions[0].teamCount,
    pendingTasks: projectOptions[0].pendingTasks,
    allPendingTasks: projectOptions[0].allPendingTasks,
    alertCount: projectOptions[0].alertCount,
    latestTask: projectOptions[0].latestTask,
    showNotificationDialog: false,
    notificationTitle: '',
    notificationTasks: [] as NotificationTask[],
    liveNotificationTasks: [] as NotificationTask[],
  },
  lifetimes: {
    attached() {
      const runtime = getRuntimeConfig()
      this.setData({
        selectedProjectId: runtime.projectId || projectOptions[0].id,
        selectedProjectCode: runtime.projectCode || projectOptions[0].code,
      })
      this.loadProjects()
    },
  },
  methods: {
    applyProject(project: SyncProject, extraData: AnyObject = {}) {
      setRuntimeConfig({
        projectId: project.id,
        projectCode: project.code,
      })
      this.setData({
        selectedProjectId: project.id,
        selectedProjectCode: project.code,
        projectName: project.name,
        projectLocation: project.location,
        progress: project.progress,
        activeTasks: project.activeTasks,
        teamCount: project.teamCount,
        pendingTasks: project.pendingTasks,
        allPendingTasks: project.allPendingTasks,
        alertCount: project.alertCount,
        latestTask: project.latestTask,
        ...extraData,
      })
      this.loadLiveDashboard(project.code || project.id)
      this.loadNotifications(project.code || project.id)
    },
    async loadLiveDashboard(projectIdentifier?: string) {
      const identifier = String(projectIdentifier || this.data.selectedProjectCode || this.data.selectedProjectId || '')
      if (!identifier) return
      const summary = await fetchProjectDashboardSummary(identifier)
      if (!summary) return

      this.setData({
        selectedProjectId: summary.id,
        selectedProjectCode: summary.code,
        projectName: summary.name,
        projectLocation: summary.location,
        progress: summary.progress,
        activeTasks: summary.activeTasks,
        teamCount: summary.teamCount,
        pendingTasks: summary.pendingTasks,
        allPendingTasks: summary.allPendingTasks,
        alertCount: summary.alertCount,
        latestTask: summary.latestTask,
      })
    },
    async loadNotifications(projectIdentifier?: string) {
      const identifier = String(projectIdentifier || this.data.selectedProjectCode || this.data.selectedProjectId || '')
      if (!identifier) return

      const liveNotifications = (await fetchNotifications(identifier)).map((item: SyncNotification) => ({
        id: item.id,
        taskId: item.taskId,
        title: item.title,
        project: item.project,
        source: item.source,
        priority: item.priority,
        due: item.due,
      }))

      if (!liveNotifications.length) {
        this.setData({
          liveNotificationTasks: [],
        })
        return
      }

      this.setData({
        liveNotificationTasks: liveNotifications,
        pendingTasks: liveNotifications.length,
        latestTask: liveNotifications[0].title,
      })
    },
    async loadProjects() {
      const projects = await fetchProjects()
      const runtime = getRuntimeConfig()
      const selected = projects.find((item) => item.code === runtime.projectCode || item.id === runtime.projectId) || projects[0]
      if (!selected) return
      this.applyProject(selected, { projectOptions: projects })
    },
    openModule(event: WechatMiniprogram.TouchEvent) {
      const url = String(event.currentTarget.dataset.url || '')
      if (!url) return
      const runtime = getRuntimeConfig()
      const params = [
        `projectId=${encodeURIComponent(String(this.data.selectedProjectCode || this.data.selectedProjectId || ''))}`,
      ]
      if (runtime.memberId) {
        params.push(`memberId=${encodeURIComponent(runtime.memberId)}`)
      }
      wx.navigateTo({
        url: `${url}?${params.join('&')}`,
      })
    },
    openProjectSelector() {
      this.setData({
        showProjectSelector: true,
      })
    },
    closeProjectSelector() {
      this.setData({
        showProjectSelector: false,
      })
    },
    selectProject(event: WechatMiniprogram.TouchEvent) {
      const code = String(event.currentTarget.dataset.code || '')
      const project = (this.data.projectOptions as SyncProject[]).find((item) => item.code === code)
      if (!project) return

      this.applyProject(project, { showProjectSelector: false })
    },
    openTaskAlert() {
      const runtime = getRuntimeConfig()
      const params = [
        `projectId=${encodeURIComponent(String(this.data.selectedProjectCode || this.data.selectedProjectId || ''))}`,
      ]
      if (runtime.memberId) {
        params.push(`memberId=${encodeURIComponent(runtime.memberId)}`)
      }
      wx.showModal({
        title: '新任务提醒',
        content: `${this.data.latestTask}。是否现在查看任务详情？`,
        cancelText: '稍后',
        confirmText: '查看',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/pages/tasks/tasks?${params.join('&')}`,
            })
          }
        },
      })
    },
    openNotificationList(event: WechatMiniprogram.TouchEvent) {
      const scope = String(event.currentTarget.dataset.scope || 'current')
      const liveTasks = this.data.liveNotificationTasks as NotificationTask[]
      const fallbackTasks = scope === 'all'
        ? allNotificationTasks
        : allNotificationTasks.filter((item) => item.project === this.data.projectName)
      const tasks = liveTasks.length ? liveTasks : fallbackTasks

      this.setData({
        showNotificationDialog: true,
        notificationTitle: scope === 'all' ? '全部项目通知' : '当前项目通知',
        notificationTasks: tasks,
      })
    },
    closeNotificationList() {
      this.setData({
        showNotificationDialog: false,
      })
    },
  },
})
