import { gpDemoData } from '../../utils/gpDemoData'
import {
  confirmTask,
  createTask,
  fetchProjectContacts,
  fetchTasks,
  getRuntimeConfig,
  IncomingTaskView,
  MyTaskView,
  rejectTask,
  requestTaskHelp,
  setRuntimeConfig,
  submitTaskProgress,
  SyncProjectContact,
  SyncTask,
  toIncomingTaskView,
  toMyTaskView,
} from '../../utils/gpSync'

type PublishPreview = {
  title: string
  module: string
  owner: string
  recipients: string
  priority: string
  due: string
  note: string
}

type RecipientOption = {
  id: string
  name: string
  role: string
  selected: boolean
}

Component({
  data: {
    projectId: gpDemoData.project.id,
    projectName: gpDemoData.project.name,
    memberId: '',
    memberName: '',
    configExpanded: false,
    configDraftMemberId: '',
    contacts: [] as SyncProjectContact[],
    incomingTasks: [] as IncomingTaskView[],
    myTasks: [] as MyTaskView[],
    pendingCount: 0,
    showPublishDialog: false,
    publishStep: 'input',
    publishDraft: '请王晴今天 18:00 前确认签到胸卡缺口，如果少于 80 个就安排补打。',
    publishPreview: null as PublishPreview | null,
    recipientMode: 'single',
    recipientOptions: [] as RecipientOption[],
    selectedRecipientText: '未选择',
  },
  lifetimes: {
    attached() {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1] as WechatMiniprogram.Page.Instance<AnyObject, AnyObject> & { options?: Record<string, string | undefined> }
      this.applyRouteProject(currentPage?.options || {})
    },
  },
  methods: {
    onLoad(options: Record<string, string | undefined>) {
      this.applyRouteProject(options)
    },
    async applyRouteProject(options: Record<string, string | undefined>) {
      const runtime = getRuntimeConfig()
      const projectId = String(options.projectId || options.projectCode || runtime.projectCode || runtime.projectId || gpDemoData.project.id)
      const projectName = String(options.projectName || gpDemoData.project.name)
      const memberId = String(options.memberId || runtime.memberId || '')
      const memberName = String(runtime.memberName || '')

      setRuntimeConfig({
        projectId,
        projectCode: projectId,
        memberId,
        memberName,
      })

      this.setData({
        projectId,
        projectName,
        memberId,
        memberName,
        configDraftMemberId: memberId,
      })

      await this.loadContacts()
      await this.loadTasks()
    },
    async loadContacts() {
      const contacts = await fetchProjectContacts(String(this.data.projectId))
      const currentMemberId = String(this.data.memberId || '')
      const fallbackContact = contacts.find((item) => item.memberId === currentMemberId) || contacts[0]
      const nextMemberId = currentMemberId || fallbackContact?.memberId || ''
      const nextMemberName = fallbackContact?.name || String(this.data.memberName || '')
      const recipientOptions = contacts.map((contact, index) => ({
        id: contact.memberId,
        name: contact.name,
        role: contact.role,
        selected: nextMemberId ? contact.memberId === nextMemberId : index === 0,
      }))

      if (nextMemberId) {
        setRuntimeConfig({
          memberId: nextMemberId,
          memberName: nextMemberName,
        })
      }

      this.setData({
        contacts,
        memberId: nextMemberId,
        memberName: nextMemberName,
        configDraftMemberId: nextMemberId,
        recipientOptions,
        selectedRecipientText: nextMemberName || this.getSelectedRecipientText(String(this.data.recipientMode || 'single'), recipientOptions),
      })
    },
    async loadTasks() {
      const tasks = await fetchTasks(String(this.data.projectId), String(this.data.memberId || ''))
      const pendingTasks = tasks.filter((task) => task.status === 'PENDING_CONFIRMATION')
      const activeTasks = tasks.filter((task) => task.status !== 'PENDING_CONFIRMATION')

      this.setData({
        incomingTasks: pendingTasks.map(toIncomingTaskView),
        myTasks: activeTasks.map(toMyTaskView),
        pendingCount: pendingTasks.length,
      })
    },
    toggleConfig() {
      this.setData({
        configExpanded: !this.data.configExpanded,
      })
    },
    onMemberIdInput(event: WechatMiniprogram.TouchEvent) {
      this.setData({
        configDraftMemberId: String((event as any).detail.value || ''),
      })
    },
    applyContactMember(event: WechatMiniprogram.TouchEvent) {
      const memberId = String(event.currentTarget.dataset.memberId || '')
      const memberName = String(event.currentTarget.dataset.memberName || '')
      this.setData({
        configDraftMemberId: memberId,
        memberName,
      })
    },
    async saveRuntimeConfig() {
      const memberId = String(this.data.configDraftMemberId || '').trim()
      const member = (this.data.contacts as SyncProjectContact[]).find((item) => item.memberId === memberId)
      setRuntimeConfig({
        projectId: String(this.data.projectId),
        projectCode: String(this.data.projectId),
        memberId,
        memberName: member?.name || '',
      })
      this.setData({
        memberId,
        memberName: member?.name || '',
        configExpanded: false,
      })
      await this.loadTasks()
      wx.showToast({ title: '已同步执行身份', icon: 'success' })
    },
    async acceptTask(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const ok = await confirmTask(id, String(this.data.memberId || ''), String(this.data.projectId), '小程序现场端接受任务')
      if (!ok) {
        wx.showToast({ title: '接受失败', icon: 'none' })
        return
      }
      await this.loadTasks()
      wx.showToast({ title: '已接受', icon: 'success' })
    },
    async rejectTask(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const ok = await rejectTask(id, String(this.data.memberId || ''), String(this.data.projectId), '小程序现场端拒绝任务')
      if (!ok) {
        wx.showToast({ title: '拒绝失败', icon: 'none' })
        return
      }
      await this.loadTasks()
      wx.showToast({ title: '已拒绝', icon: 'none' })
    },
    async updateProgress(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const value = Number((event as any).detail.value || 0)
      const ok = await submitTaskProgress(
        id,
        String(this.data.memberId || ''),
        String(this.data.projectId),
        value,
        `小程序现场端更新进度：${value}%`,
      )
      if (!ok) {
        wx.showToast({ title: '进度同步失败', icon: 'none' })
        return
      }
      await this.loadTasks()
    },
    async askTaskHelp(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const task = (this.data.myTasks as MyTaskView[]).find((item) => item.id === id)
      const title = task?.title || '当前任务'
      const result = await requestTaskHelp(
        id,
        String(this.data.memberId || ''),
        String(this.data.projectId),
        `我在「${title}」上需要帮助，请告诉我下一步先做什么、找谁、还缺什么信息。`,
      )
      const reply = result?.reply || result?.advice?.reply || 'AI 暂时没有返回明确建议。'
      wx.showModal({
        title: 'AI 建议',
        content: String(reply),
        showCancel: false,
        confirmText: '知道了',
      })
    },
    publishTask() {
      this.setData({
        showPublishDialog: true,
        publishStep: 'input',
        publishPreview: null,
      })
    },
    closePublishDialog() {
      this.setData({
        showPublishDialog: false,
      })
    },
    onPublishInput(event: WechatMiniprogram.TouchEvent) {
      this.setData({
        publishDraft: (event as any).detail.value,
      })
    },
    selectRecipientMode(event: WechatMiniprogram.TouchEvent) {
      const mode = String(event.currentTarget.dataset.mode || 'single')
      const recipientOptions = (this.data.recipientOptions as RecipientOption[]).map((item, index) => ({
        ...item,
        selected: mode === 'all' ? false : mode === 'single' ? index === 0 : item.selected,
      }))

      this.setData({
        recipientMode: mode,
        recipientOptions,
        selectedRecipientText: this.getSelectedRecipientText(mode, recipientOptions),
      })
    },
    toggleRecipient(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const mode = String(this.data.recipientMode || 'single')
      const recipientOptions = (this.data.recipientOptions as RecipientOption[]).map((item) => {
        if (mode === 'single') {
          return {
            ...item,
            selected: item.id === id,
          }
        }

        if (item.id !== id) return item
        return {
          ...item,
          selected: !item.selected,
        }
      })

      this.setData({
        recipientOptions,
        selectedRecipientText: this.getSelectedRecipientText(mode, recipientOptions),
      })
    },
    getSelectedRecipientText(mode: string, recipientOptions: RecipientOption[]) {
      if (mode === 'all') return '全体成员'
      const selected = recipientOptions.filter((item) => item.selected)
      if (!selected.length) return '未选择'
      if (mode === 'single') return selected[0].name
      return selected.map((item) => item.name).join('、')
    },
    translatePublishDraft() {
      const draft = String(this.data.publishDraft || '').trim()
      if (!draft) {
        wx.showToast({ title: '先输入任务', icon: 'none' })
        return
      }
      if (String(this.data.selectedRecipientText || '') === '未选择') {
        wx.showToast({ title: '先选择对象', icon: 'none' })
        return
      }

      const preview: PublishPreview = {
        title: draft.includes('胸卡') ? '复核签到胸卡缺口并确认是否补打' : '确认现场新增任务并回传结果',
        module: draft.includes('签到') || draft.includes('胸卡') ? '签到接待' : '舞台执行',
        owner: String(this.data.selectedRecipientText || '待指定'),
        recipients: String(this.data.selectedRecipientText || '待指定'),
        priority: draft.includes('今天') || draft.includes('18:00') ? '高优先级' : '普通',
        due: draft.includes('18:00') ? '2026.06.02 18:00' : '2026.06.02 20:00',
        note: draft,
      }

      this.setData({
        publishPreview: preview,
        publishStep: 'preview',
      })
    },
    async confirmPublishTask() {
      const preview = this.data.publishPreview as PublishPreview | null
      if (!preview) return

      await createTask(String(this.data.projectId), {
        title: preview.title,
        description: preview.note,
        priority: preview.priority === '高优先级' ? 'HIGH' : 'MEDIUM',
      })

      this.setData({
        showPublishDialog: false,
        publishStep: 'input',
        publishPreview: null,
      })
      await this.loadTasks()
      wx.showToast({ title: '已发布待确认', icon: 'success' })
    },
  },
})
