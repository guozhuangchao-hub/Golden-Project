import { fetchProjectDetail, getRuntimeConfig, setRuntimeConfig } from '../../utils/gpSync'
import { getOverallProgress, gpDemoData } from '../../utils/gpDemoData'

Component({
  data: {
    projectId: gpDemoData.project.id,
    project: gpDemoData.project,
    progress: getOverallProgress(),
    structure: gpDemoData.modules,
    contacts: gpDemoData.contacts,
    moduleCount: gpDemoData.modules.length,
    taskCount: gpDemoData.tasks.length,
  },
  lifetimes: {
    attached() {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1] as WechatMiniprogram.Page.Instance<AnyObject, AnyObject> & { options?: Record<string, string | undefined> }
      const runtime = getRuntimeConfig()
      const projectId = currentPage?.options?.projectId || currentPage?.options?.projectCode || runtime.projectCode || runtime.projectId || gpDemoData.project.id
      setRuntimeConfig({
        projectId: String(projectId),
        projectCode: String(projectId),
      })
      this.setData({ projectId: String(projectId) })
      this.loadProject()
    },
  },
  methods: {
    async loadProject() {
      const detail = await fetchProjectDetail(String(this.data.projectId))
      this.setData({
        project: detail.project,
        progress: detail.progress,
        structure: detail.structure,
        contacts: detail.contacts,
        moduleCount: detail.moduleCount,
        taskCount: detail.taskCount,
      })
    },
    callContact(event: WechatMiniprogram.TouchEvent) {
      const phoneNumber = String(event.currentTarget.dataset.phone || '')
      if (!phoneNumber) return
      wx.makePhoneCall({ phoneNumber })
    },
  },
})
