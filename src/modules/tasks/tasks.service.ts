import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  TaskLogAction,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  PublishRecipientMode,
  PublishTaskDto,
  TranslateTaskDto,
} from './dto/publish-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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

  private async resolveRecipients(projectIdentifier: string, dto: TranslateTaskDto) {
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

    const task = await this.prisma.task.create({
      data: {
        projectId: project.id,
        moduleId: dto.moduleId || preview.moduleId,
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

    return {
      task,
      preview,
      notificationsCreated: notifications.count,
    };
  }

  async create(projectId: string, dto: CreateTaskDto) {
    const ownerMember = dto.ownerMemberId
      ? await this.prisma.projectMember.findUnique({
          where: { id: dto.ownerMemberId },
          include: { user: true },
        })
      : null;

    const assistantMember = dto.assistantMemberId
      ? await this.prisma.projectMember.findUnique({
          where: { id: dto.assistantMemberId },
          include: { user: true },
        })
      : null;

    return this.prisma.task.create({
      data: {
        projectId,
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
        createdById: 'SYSTEM_SEED_USER_ID',
        logs: {
          create: {
            action: TaskLogAction.CREATED,
            content: 'Task created',
          },
        },
      },
      include: {
        logs: true,
      },
    });
  }

  findAll(projectId: string) {
    return this.prisma.task.findMany({
      where: { projectId },
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
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
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
}
