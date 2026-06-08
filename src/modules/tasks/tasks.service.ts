import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EventSourceType,
  EventStatus,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  TaskLogAction,
  TaskPriority,
  TaskStatus,
  TaskUpdateType,
  VisibilityScope,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskUpdateDto } from './dto/create-task-update.dto';
import {
  PublishRecipientMode,
  PublishTaskDto,
  TranslateTaskDto,
} from './dto/publish-task.dto';
import { TranslateByImageDto } from './dto/translate-by-image.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async resolveProject(identifier: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
        },
        members: {
          where: { status: 'ACTIVE' },
          include: { user: true },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private async ensureSystemUser() {
    return this.prisma.user.upsert({
      where: { email: 'system-task-publisher@golden.local' },
      update: {},
      create: {
        name: '任务发布系统',
        email: 'system-task-publisher@golden.local',
        remark: '用于后台 AI 任务发布与小程序通知',
      },
    });
  }

  private async resolveRecipients(
    projectIdentifier: string,
    dto: { recipientMode: PublishRecipientMode; recipientMemberIds?: string[] },
  ) {
    const project = await this.resolveProject(projectIdentifier);
    const members = project.members;

    if (dto.recipientMode === PublishRecipientMode.all) {
      if (!members.length) {
        throw new BadRequestException('Project has no active members');
      }
      return { project, recipients: members };
    }

    const ids = dto.recipientMemberIds || [];
    if (!ids.length) {
      throw new BadRequestException('Please select at least one recipient');
    }

    const recipients = members.filter((member) => ids.includes(member.id));
    if (!recipients.length) {
      throw new BadRequestException('Selected recipients are not project members');
    }

    if (dto.recipientMode === PublishRecipientMode.single && recipients.length !== 1) {
      throw new BadRequestException('Single recipient mode requires exactly one recipient');
    }

    return { project, recipients };
  }

  private parseDueTime(text: string) {
    const now = new Date();
    const normalized = text.replace(/\s+/g, ' ');
    const timeMatch = normalized.match(/(\d{1,2})[:：点](\d{2})?/);
    let hour = timeMatch ? Number(timeMatch[1]) : 20;
    const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;

    const due = new Date(now);
    if (/明天/.test(normalized)) {
      due.setDate(due.getDate() + 1);
    }
    if (/后天/.test(normalized)) {
      due.setDate(due.getDate() + 2);
    }
    if (/(下午|晚上|今晚)/.test(normalized) && hour > 0 && hour < 12) {
      hour += 12;
    }
    if (/中午/.test(normalized) && hour < 11) {
      hour = 12;
    }
    due.setHours(hour, minute, 0, 0);

    return due.toISOString();
  }

  private inferPriority(text: string) {
    if (/紧急|立刻|马上|今天|18[:：点]?00|中午前|下班前|今晚|逾期|缺口|少于/.test(text)) {
      return TaskPriority.HIGH;
    }
    if (/低优先|不急|明天之后/.test(text)) {
      return TaskPriority.LOW;
    }
    return TaskPriority.MEDIUM;
  }

  private inferModule(project: Awaited<ReturnType<TasksService['resolveProject']>>, text: string) {
    const directMatch = project.modules.find((module) => text.includes(module.name));
    if (directMatch) {
      return directMatch;
    }

    const rules: Array<[RegExp, string[]]> = [
      [/签到|胸卡|证件|接待|嘉宾/, ['签到', '接待', '证件', '嘉宾']],
      [/舞台|彩排|灯光|音响|主持|话筒|run down/i, ['舞台', '论坛']],
      [/物料|礼包|导视|搭建|展位/, ['物料', '搭建', '展位']],
      [/车辆|接送|酒店|后勤|供应商/, ['后勤', '供应商', '接送', '车辆']],
      [/直播|媒体|宣传|摄影/, ['媒体', '直播', '宣传']],
      [/志愿者|现场|巡检|闭馆|撤展/, ['现场', '志愿者']],
    ];

    for (const [pattern, keywords] of rules) {
      if (!pattern.test(text)) {
        continue;
      }

      const matched = project.modules.find((module) =>
        keywords.some((keyword) => module.name.includes(keyword)),
      );
      if (matched) {
        return matched;
      }
    }

    return project.modules[0] || null;
  }

  private inferTitle(text: string) {
    const cleaned = text
      .replace(/^请/, '')
      .replace(/如果.*$/, '')
      .replace(/[。！？!?]\s*$/, '')
      .trim();

    if (/胸卡|缺口|补打/.test(text)) {
      return '复核签到胸卡缺口并确认是否补打';
    }

    if (/彩排|灯光|音响/.test(text)) {
      return '确认彩排时间调整并同步灯光音响';
    }

    return cleaned.length > 6 ? cleaned.slice(0, 80) : '确认现场新增任务并回传结果';
  }

  private async recordTaskEvent(params: {
    projectId: string;
    taskId: string;
    title: string;
    description?: string | null;
    moduleName?: string | null;
    ownerName?: string | null;
    priority?: TaskPriority;
    dueTime?: Date | string | null;
    systemUserId: string;
    sourceChannel: string;
    rawText?: string | null;
    recipientMode?: string | null;
  }) {
    return this.prisma.event.create({
      data: {
        projectId: params.projectId,
        eventType: 'task_publish',
        title: params.title,
        description: params.description || params.rawText || '后台发布任务已生成正式任务。',
        status: EventStatus.confirmed,
        confidence: 1,
        sourceType: EventSourceType.manual,
        sourceChannel: params.sourceChannel,
        sourceSender: '任务发布',
        sourceSenderRole: 'admin',
        rawContent: params.rawText || params.description || params.title,
        visibilityScope: VisibilityScope.admin,
        aiResult: {
          source: params.sourceChannel,
          taskId: params.taskId,
          recipientMode: params.recipientMode,
        },
        proposedChanges: {
          task: {
            id: params.taskId,
            title: params.title,
            description: params.description,
            moduleName: params.moduleName,
            ownerName: params.ownerName,
            priority: params.priority,
            dueTime: params.dueTime ? new Date(params.dueTime).toISOString() : undefined,
          },
        },
        createdById: params.systemUserId,
        confirmedById: params.systemUserId,
        confirmedAt: new Date(),
      },
    });
  }

  async translatePublish(projectIdentifier: string, dto: TranslateTaskDto) {
    const { project, recipients } = await this.resolveRecipients(projectIdentifier, dto);
    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException('Task description is required');
    }

    const module = this.inferModule(project, text);
    const priority = this.inferPriority(text);
    const dueTime = this.parseDueTime(text);
    const ownerMember = recipients[0] || null;

    return {
      title: this.inferTitle(text),
      description: text,
      moduleId: module?.id,
      moduleName: module?.name || '项目级任务',
      ownerMemberId: ownerMember?.id,
      ownerName: ownerMember?.user?.name || '待指定负责人',
      recipientMode: dto.recipientMode,
      recipients: recipients.map((member) => ({
        memberId: member.id,
        userId: member.userId,
        name: member.user?.name || '未命名成员',
        role: member.role,
        title: member.title,
      })),
      priority,
      dueTime,
      dueTimeLabel: new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dueTime)),
    };
  }

  async translateByImage(projectIdentifier: string, dto: TranslateByImageDto) {
    const { project, recipients } = await this.resolveRecipients(projectIdentifier, dto);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('GEMINI_API_KEY not configured');
    }

    const projectContext = [
      '项目名称：' + project.name,
      '项目模块：' + (project.modules || []).map((m) => m.name).join('、'),
      '项目成员：' + (project.members || []).map((m) => m.user?.name + '(' + m.role + ')').join('、'),
    ].join('\n');

    const recipientHint = dto.recipientMode === 'all'
      ? '分配给全体成员'
      : dto.recipientMemberIds?.length
        ? '分配给以下成员：' + recipients.map((r) => r.user?.name).join('、')
        : '未指定接收人';

    const extraText = dto.text ? '\n额外文字上下文：' + dto.text : '';

    const prompt = `你是一个活动执行项目群消息的识别助手。用户上传了微信群聊天截图${extraText}。

项目背景：
${projectContext}

分配方式：${recipientHint}

请从截图和文字中提取任务信息，以 JSON 格式返回，严格遵循以下字段（不要包含markdown包裹）：

{
  "title": "任务标题（简洁），不超过20字",
  "description": "任务详细描述（原文精华摘要）",
  "moduleName": "匹配到的项目模块名称，没有则为空字符串",
  "ownerName": "负责人姓名（从截图中提取，没有则为空字符串）",
  "priority": "MEDIUM（普通）/ HIGH（高优先级）/ URGENT（紧急），根据语言判断",
  "dueTime": "ISO 8601 截止时间（例如 2026-06-08T18:00:00.000Z），根据截图中的时间推断"
}

只返回 JSON，不要加任何说明文字。`;

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey);

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: dto.imageMimeType,
                data: dto.imageBase64,
              },
            },
          ],
        },
      ],
    };

    let geminiText: string;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        this.logger.error('Gemini API error: ' + response.status + ' ' + errText);
        throw new BadRequestException('图片识别服务暂时不可用');
      }

      const data = await response.json() as any;
      geminiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!geminiText) {
        throw new BadRequestException('Gemini 未能返回识别结果');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Gemini API call failed', error);
      throw new BadRequestException('调用图片识别服务失败');
    }

    // Strip possible markdown code block fences
    const cleaned = geminiText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.error('Failed to parse Gemini response as JSON: ' + geminiText);
      throw new BadRequestException('图片识别结果格式异常');
    }

    const ownerMember = recipients[0] || null;
    const matchedModule = parsed.moduleName
      ? (project.modules || []).find((m) => m.name.includes(parsed.moduleName) || parsed.moduleName.includes(m.name))
      : null;

    const priority = ['HIGH', 'URGENT'].includes(parsed.priority) ? parsed.priority : 'MEDIUM';
    const fallbackDue = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const dueTime = parsed.dueTime
      ? (() => {
          const d = new Date(parsed.dueTime);
          return Number.isNaN(d.getTime()) ? fallbackDue.toISOString() : d.toISOString();
        })()
      : fallbackDue.toISOString();

    return {
      title: String(parsed.title || '未命名任务').slice(0, 200),
      description: String(parsed.description || ''),
      moduleId: matchedModule?.id,
      moduleName: matchedModule?.name || parsed.moduleName || '项目级任务',
      ownerMemberId: ownerMember?.id,
      ownerName: String(parsed.ownerName || ownerMember?.user?.name || '待指定负责人'),
      recipientMode: dto.recipientMode,
      recipients: recipients.map((member) => ({
        memberId: member.id,
        userId: member.userId,
        name: member.user?.name || '未命名成员',
        role: member.role,
        title: member.title,
      })),
      priority,
      dueTime,
      dueTimeLabel: new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(dueTime)),
    };
  }

  async publish(projectIdentifier: string, dto: PublishTaskDto) {
    const preview = await this.translatePublish(projectIdentifier, dto);
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: projectIdentifier }, { code: projectIdentifier }],
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const systemUser = await this.ensureSystemUser();
    const ownerMemberId = preview.ownerMemberId;
    const ownerMember = ownerMemberId
      ? await this.prisma.projectMember.findUnique({ where: { id: ownerMemberId } })
      : null;
    const editedModule = !dto.moduleId && dto.moduleName
      ? await this.prisma.projectModule.findFirst({
          where: { projectId: project.id, name: dto.moduleName },
        })
      : null;

    const task = await this.prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: dto.moduleId || editedModule?.id || preview.moduleId,
        title: dto.title || preview.title,
        description: preview.description,
        priority: dto.priority || preview.priority,
        ownerId: ownerMember?.userId,
        ownerMemberId: ownerMember?.id,
        dueTime: new Date(dto.dueTime || preview.dueTime),
        createdById: systemUser.id,
        logs: {
          create: {
            action: TaskLogAction.CREATED,
            operatorId: systemUser.id,
            content: '后台 AI 发布任务，并写入小程序通知队列',
            extraData: {
              source: 'dashboard_task_publish',
              rawText: dto.text,
              recipientMode: dto.recipientMode,
            },
          },
        },
      },
      include: {
        owner: true,
        module: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const notifications = await this.prisma.notification.createMany({
      data: preview.recipients.map((recipient) => ({
        projectId: project.id,
        taskId: task.id,
        receiverId: recipient.userId,
        senderId: systemUser.id,
        type: NotificationType.TASK_ASSIGNED,
        channel: NotificationChannel.MINI_PROGRAM,
        status: NotificationStatus.PENDING,
        title: '新的任务待确认',
        content: `${project.name}：${task.title}`,
        payload: {
          source: 'dashboard_task_publish',
          taskId: task.id,
          projectCode: project.code,
          rawText: dto.text,
          recipientMode: dto.recipientMode,
        },
      })),
    });

    await this.recordTaskEvent({
      projectId: project.id,
      taskId: task.id,
      title: task.title,
      description: task.description,
      moduleName: task.module?.name || preview.moduleName,
      ownerName: task.owner?.name || preview.ownerName,
      priority: task.priority,
      dueTime: task.dueTime,
      systemUserId: systemUser.id,
      sourceChannel: 'dashboard_task_publish',
      rawText: dto.text,
      recipientMode: dto.recipientMode,
    });

    return {
      task,
      preview,
      notificationsCreated: notifications.count,
    };
  }

  async create(projectId: string, dto: CreateTaskDto) {
    const project = await this.resolveProject(projectId);
    const systemUser = await this.ensureSystemUser();
    const ownerMember = dto.ownerMemberId
      ? await this.prisma.projectMember.findUnique({
          where: { id: dto.ownerMemberId, projectId: project.id },
          include: { user: true },
        })
      : null;

    const assistantMember = dto.assistantMemberId
      ? await this.prisma.projectMember.findUnique({
          where: { id: dto.assistantMemberId, projectId: project.id },
          include: { user: true },
        })
      : null;

    const task = await this.prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: dto.moduleId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        ownerId: ownerMember?.userId,
        ownerMemberId: ownerMember?.id,
        assistantId: assistantMember?.userId,
        assistantMemberId: assistantMember?.id,
        startTime: dto.startTime ? new Date(dto.startTime) : undefined,
        dueTime: dto.dueTime ? new Date(dto.dueTime) : undefined,
        createdById: systemUser.id,
        logs: {
          create: {
            action: TaskLogAction.CREATED,
            operatorId: systemUser.id,
            content: 'Task created',
          },
        },
      },
      include: {
        owner: true,
        module: true,
        logs: true,
      },
    });

    await this.recordTaskEvent({
      projectId: project.id,
      taskId: task.id,
      title: task.title,
      description: task.description,
      moduleName: task.module?.name,
      ownerName: task.owner?.name,
      priority: task.priority,
      dueTime: task.dueTime,
      systemUserId: systemUser.id,
      sourceChannel: 'task_create_api',
      rawText: dto.description || dto.title,
    });

    return task;
  }

  async findAll(projectId: string) {
    const project = await this.resolveProject(projectId);
    return this.prisma.task.findMany({
      where: { projectId: project.id },
      include: {
        owner: true,
        assistant: true,
        module: true,
      },
      orderBy: [{ dueTime: 'asc' }, { createdAt: 'desc' }],
    });
  }

  findOne(taskId: string) {
    return this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        owner: true,
        assistant: true,
        module: true,
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  listUpdates(taskId: string) {
    return this.prisma.taskUpdate.findMany({
      where: { taskId },
      include: {
        member: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async changeStatus(
    taskId: string,
    dto: UpdateTaskStatusDto,
    toStatus: TaskStatus,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return null;
    }

    const completedAt = toStatus === TaskStatus.COMPLETED ? new Date() : undefined;
    const confirmedAt = toStatus === TaskStatus.CONFIRMED ? new Date() : undefined;
    const cancelledAt = toStatus === TaskStatus.CANCELLED ? new Date() : undefined;

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: toStatus,
        completedAt,
        confirmedAt,
        cancelledAt,
        logs: {
          create: {
            action:
              toStatus === TaskStatus.CONFIRMED
                ? TaskLogAction.CONFIRMED
                : toStatus === TaskStatus.COMPLETED
                  ? TaskLogAction.COMPLETED
                  : toStatus === TaskStatus.CANCELLED
                    ? TaskLogAction.CANCELLED
                    : TaskLogAction.STATUS_CHANGED,
            fromStatus: task.status,
            toStatus,
            content: dto.content,
          },
        },
      },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async addUpdate(taskId: string, dto: CreateTaskUpdateDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        owner: true,
        ownerMember: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const member = dto.memberId
      ? await this.prisma.projectMember.findUnique({
          where: { id: dto.memberId },
          include: { user: true },
        })
      : null;

    const update = await this.prisma.taskUpdate.create({
      data: {
        taskId,
        memberId: member?.id,
        type: dto.type,
        content: dto.content,
        progressPercent: dto.progressPercent,
      },
      include: {
        member: {
          include: {
            user: true,
          },
        },
      },
    });

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        lastProgressAt:
          dto.type === TaskUpdateType.PROGRESS ? new Date() : undefined,
        blockedAt:
          dto.type === TaskUpdateType.BLOCKER || dto.type === TaskUpdateType.HELP_REQUEST
            ? new Date()
            : dto.type === TaskUpdateType.PROGRESS
              ? null
              : undefined,
        needsHelp:
          dto.type === TaskUpdateType.BLOCKER || dto.type === TaskUpdateType.HELP_REQUEST
            ? true
            : dto.type === TaskUpdateType.PROGRESS
              ? false
              : undefined,
        logs: {
          create: {
            action: TaskLogAction.COMMENTED,
            operatorId: member?.userId,
            content: dto.content,
            extraData: {
              updateType: dto.type,
              progressPercent: dto.progressPercent,
            },
          },
        },
      },
    });

    if ((dto.type === TaskUpdateType.BLOCKER || dto.type === TaskUpdateType.HELP_REQUEST) && task.ownerId) {
      await this.notificationsService.createReminder({
        projectId: task.projectId,
        taskId: task.id,
        receiverId: task.ownerId,
        senderId: member?.userId,
        type: NotificationType.TASK_STATUS_CHANGED,
        title: dto.type === TaskUpdateType.HELP_REQUEST ? '任务需要协助' : '任务出现阻塞',
        content: `${task.project.name}：${task.title} 出现新反馈，请尽快跟进`,
        payload: {
          taskId: task.id,
          updateType: dto.type,
          memberId: member?.id ?? null,
        },
        cooldownHours: 1,
      });
    }

    return update;
  }
}
