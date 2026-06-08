import { gpDemoData } from '../../utils/gpDemoData'
import { askProjectAgent, getRuntimeConfig, setRuntimeConfig } from '../../utils/gpSync'

type Message = {
  role: 'user' | 'agent'
  content: string
}

Component({
  data: {
    draft: '',
    lastMessageId: 'msg-0',
    projectId: gpDemoData.project.id,
    projectName: gpDemoData.project.name,
    quickQuestions: ['这件事要找谁？', '今天有什么风险？', '项目当前进度？', '下一步先做什么？'],
    messages: [
      { role: 'agent', content: `你好，我已载入「${gpDemoData.project.name}」。你可以问项目资料、任务负责人、风险和下一步动作。` },
    ] as Message[],
  },
  lifetimes: {
    attached() {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1] as WechatMiniprogram.Page.Instance<AnyObject, AnyObject> & { options?: Record<string, string | undefined> }
      const runtime = getRuntimeConfig()
      const projectId = currentPage?.options?.projectId || currentPage?.options?.projectCode || runtime.projectCode || runtime.projectId || gpDemoData.project.id
      const projectName = currentPage?.options?.projectName || gpDemoData.project.name
      setRuntimeConfig({
        projectId: String(projectId),
        projectCode: String(projectId),
      })
      this.setData({
        projectId: String(projectId),
        projectName: String(projectName),
        messages: [
          { role: 'agent', content: `你好，我已切换到「${projectName}」。你可以问项目资料、任务负责人、风险和下一步动作。` },
        ],
      })
    },
  },
  methods: {
    onInput(event: WechatMiniprogram.TouchEvent) {
      this.setData({
        draft: (event as any).detail.value,
      })
    },
    askQuick(event: WechatMiniprogram.TouchEvent) {
      const question = String(event.currentTarget.dataset.question || '')
      if (!question) return
      this.appendQuestion(question)
    },
    sendQuestion() {
      const question = String(this.data.draft || '').trim()
      if (!question) return
      this.appendQuestion(question)
      this.setData({ draft: '' })
    },
    async appendQuestion(question: string) {
      const baseMessages = [
        ...(this.data.messages as Message[]),
        { role: 'user' as const, content: question },
      ]
      this.setData({
        messages: baseMessages,
        lastMessageId: `msg-${baseMessages.length - 1}`,
      })

      const result = await askProjectAgent(String(this.data.projectId), question)
      const messages = [
        ...baseMessages,
        { role: 'agent' as const, content: result.reply || '当前没有拿到有效回复。' },
      ]
      this.setData({
        messages,
        lastMessageId: `msg-${messages.length - 1}`,
      })
    },
  },
})
