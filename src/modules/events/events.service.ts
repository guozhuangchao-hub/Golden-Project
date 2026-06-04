import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EventStatus,
  Prisma,
  TaskLogAction,
  TaskPriority,
  VisibilityScope,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { ReviewEventDto, UpdateEventStatusDto } from './dto/review-event.dto';

type ProposedTask = {
  title?: string;
  description?: string;
  moduleName?: string;
  priority?: TaskPriority;
  ownerName?: string;
  assistantName?: string;
  startTime?: string;
  dueTime?: string;
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProject(identifier: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private async ensureSystemUser() {
    return this.prisma.user.upsert({
      where: { email: 'system-event@golden.local' },
      update: {},
      create: {
        name: 'Event 系统',
        email: 'system-event@golden.local',
        remark: '用于 Event-driven Demo 的系统确认账号',
      },
    });
  }

  private getProposedTask(proposedChanges: Prisma.JsonValue | null | undefined): ProposedTask | null {
    if (!proposedChanges || typeof proposedChanges !== 'object' || Array.isArray(proposedChanges)) {
      return null;
    }

    const proposed = proposedChanges as Record<string, unknown>;
    const task = proposed.task;

    if (task && typeof task === 'object' && !Array.isArray(task)) {
      return task as ProposedTask;
    }

    return proposed as ProposedTask;
  }

  private mergeReviewMeta(
    proposedChanges: Prisma.JsonValue | null | undefined,
    review: Record<string, unknown>,
  ) {
    const base =
      proposedChanges && typeof proposedChanges === 'object' && !Array.isArray(proposedChanges)
        ? (proposedChanges as Record<string, unknown>)
        : {};

    return {
      ...base,
      review: {
        ...(base.review && typeof base.review === 'object' && !Array.isArray(base.review)
          ? (base.review as Record<string, unknown>)
          : {}),
        ...review,
      },
    };
  }

  private async createTaskFromEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { project: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const proposedTask = this.getProposedTask(event.proposedChanges);
    const title = proposedTask?.title || event.title;
    if (!title) {
      throw new BadRequestException('Event does not contain a task title');
    }

    const moduleName = proposedTask?.moduleName;
    const module = moduleName
      ? await this.prisma.projectModule.findFirst({
          where: { projectId: event.projectId, name: moduleName },
        })
      : null;

    const ownerName = proposedTask?.ownerName;
    const ownerMember = ownerName
      ? await this.prisma.projectMember.findFirst({
          where: {
            projectId: event.projectId,
            user: { name: ownerName },
          },
          include: { user: true },
        })
      : null;

    const assistantName = proposedTask?.assistantName;
    const assistantMember = assistantName
      ? await this.prisma.projectMember.findFirst({
          where: {
            projectId: event.projectId,
            user: { name: assistantName },
          },
          include: { user: true },
        })
      : null;

    const systemUser = await this.ensureSystemUser();

    return this.prisma.task.create({
      data: {
        projectId: event.projectId,
        moduleId: module?.id,
        title,
        description: proposedTask?.description || event.description || event.rawContent,
        priority: proposedTask?.priority || TaskPriority.MEDIUM,
        ownerId: ownerMember?.userId,
        ownerMemberId: ownerMember?.id,
        assistantId: assistantMember?.userId,
        assistantMemberId: assistantMember?.id,
        startTime: proposedTask?.startTime ? new Date(proposedTask.startTime) : undefined,
        dueTime: proposedTask?.dueTime ? new Date(proposedTask.dueTime) : undefined,
        createdById: systemUser.id,
        logs: {
          create: {
            action: TaskLogAction.CREATED,
            content: `由 Event ${event.id} 经项目经理确认后生成`,
          },
        },
      },
      include: {
        owner: true,
        assistant: true,
        module: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async create(projectIdentifier: string, dto: CreateEventDto) {
    const project = await this.resolveProject(projectIdentifier);
    const confidence = dto.confidence == null ? null : new Prisma.Decimal(dto.confidence);

    return this.prisma.event.create({
      data: {
        projectId: project.id,
        eventType: dto.eventType,
        title: dto.title,
        description: dto.description,
        status: EventStatus.pending_review,
        confidence,
        sourceType: dto.sourceType,
        sourceChannel: dto.sourceChannel,
        sourceSender: dto.sourceSender,
        sourceSenderRole: dto.sourceSenderRole,
        rawContent: dto.rawContent,
        visibilityScope: dto.visibilityScope || VisibilityScope.admin,
        aiResult: dto.aiResult as Prisma.InputJsonValue,
        proposedChanges: dto.proposedChanges as Prisma.InputJsonValue,
        createdById: dto.createdById,
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
    });
  }

  async findAll(projectIdentifier: string, query: ListEventsQueryDto) {
    const project = await this.resolveProject(projectIdentifier);

    return this.prisma.event.findMany({
      where: {
        projectId: project.id,
        status: query.status,
        sourceType: query.sourceType,
        visibilityScope: query.visibilityScope,
        eventType: query.eventType,
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  findPendingReview(projectIdentifier: string) {
    return this.findAll(projectIdentifier, { status: EventStatus.pending_review });
  }

  async findOne(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        project: true,
        createdBy: true,
        confirmedBy: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async confirm(eventId: string, dto: ReviewEventDto) {
    const event = await this.findOne(eventId);
    const systemUser = dto.confirmedById ? null : await this.ensureSystemUser();

    const updatedEvent = await this.prisma.event.update({
      where: { id: event.id },
      data: {
        title: dto.title,
        description: dto.description,
        eventType: dto.eventType,
        visibilityScope: dto.visibilityScope,
        proposedChanges: dto.proposedChanges as Prisma.InputJsonValue,
        status: EventStatus.confirmed,
        confirmedById: dto.confirmedById || systemUser?.id,
        confirmedAt: new Date(),
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
    });

    const task = dto.createTask ? await this.createTaskFromEvent(event.id) : null;

    return {
      event: updatedEvent,
      task,
    };
  }

  async reject(eventId: string, dto: ReviewEventDto) {
    const event = await this.findOne(eventId);
    const systemUser = dto.confirmedById ? null : await this.ensureSystemUser();
    const reason = (dto.comment || dto.description || '').trim();

    if (!reason) {
      throw new BadRequestException('Reject reason is required');
    }

    return this.prisma.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.rejected,
        description: event.description,
        proposedChanges: this.mergeReviewMeta(event.proposedChanges, {
          action: 'rejected',
          reason,
          reviewedAt: new Date().toISOString(),
        }) as Prisma.InputJsonValue,
        confirmedById: dto.confirmedById || systemUser?.id,
        confirmedAt: new Date(),
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
    });
  }

  async needsMoreInfo(eventId: string, dto: ReviewEventDto) {
    const event = await this.findOne(eventId);

    return this.prisma.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.needs_more_info,
        description: dto.description ?? event.description,
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
    });
  }

  async updateStatus(eventId: string, dto: UpdateEventStatusDto) {
    const event = await this.findOne(eventId);

    return this.prisma.event.update({
      where: { id: event.id },
      data: {
        status: dto.status,
      },
      include: {
        createdBy: true,
        confirmedBy: true,
      },
    });
  }

  async seedDemoEvents(projectIdentifier: string) {
    const project = await this.resolveProject(projectIdentifier);

    const modules = await this.prisma.projectModule.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'asc' },
    });
    const members = await this.prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: true },
    });

    const stageModule = modules[0]?.name || '项目执行';
    const owner = members.find((member) => member.role === 'LEADER')?.user.name || '待指定负责人';
    const assistant = members.find((member) => member.role === 'EXECUTOR')?.user.name || '待指定协助人';
    const now = new Date();
    const dueSoon = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    await this.prisma.event.deleteMany({
      where: {
        projectId: project.id,
        sourceChannel: 'demo_event_seed',
      },
    });

    const events = await Promise.all([
      this.create(project.id, {
        eventType: 'task_update',
        title: 'AI识别：舞台彩排时间需要提前确认',
        description: '群内出现多次关于彩排时间调整的沟通，AI建议项目经理确认是否生成正式任务。',
        confidence: 0.92,
        sourceType: 'feishu',
        sourceChannel: 'demo_event_seed',
        sourceSender: owner,
        sourceSenderRole: 'module_leader',
        rawContent: '导演说彩排时间可能提前到下午三点，舞台组需要尽快确认灯光和音响到场。',
        visibilityScope: 'module_leader',
        aiResult: {
          summary: '识别为高置信度任务变化事件',
          confidenceReason: '包含明确时间、模块和责任动作',
        },
        proposedChanges: {
          task: {
            title: '确认舞台彩排提前后的灯光音响到场',
            description: '与导演组确认彩排调整时间，并同步灯光、音响、控台人员。',
            moduleName: stageModule,
            ownerName: owner,
            assistantName: assistant,
            priority: 'HIGH',
            dueTime: dueSoon.toISOString(),
          },
        },
      }),
      this.create(project.id, {
        eventType: 'risk',
        title: 'AI待确认：签到物料数量存在缺口',
        description: 'AI无法完全确认物料缺口数量，建议进入人工确认队列。',
        confidence: 0.68,
        sourceType: 'wechat_import',
        sourceChannel: 'demo_event_seed',
        sourceSender: '微信群截图导入',
        sourceSenderRole: 'staff',
        rawContent: '胸卡好像少了一批，现场说可能还差 80 个左右，要不要今晚补打？',
        visibilityScope: 'admin',
        aiResult: {
          summary: '识别为风险事件，但数量和责任人不完整',
          confidenceReason: '存在“好像”“可能”等不确定表达',
        },
        proposedChanges: {
          task: {
            title: '复核签到胸卡缺口并确认是否补打',
            description: '核对胸卡实际库存、缺口数量和补打截止时间。',
            moduleName: modules[1]?.name || stageModule,
            ownerName: owner,
            priority: 'URGENT',
            dueTime: dueSoon.toISOString(),
          },
        },
      }),
      this.create(project.id, {
        eventType: 'schedule_change',
        title: '手动录入：嘉宾接送车辆时间变更',
        description: '项目经理手动记录车辆调度变化，等待确认后同步任务。',
        confidence: 1,
        sourceType: 'manual',
        sourceChannel: 'demo_event_seed',
        sourceSender: '项目经理',
        sourceSenderRole: 'admin',
        rawContent: 'VIP A 抵达时间改为 18:40，接送组需要调整车辆等待时间。',
        visibilityScope: 'admin',
        aiResult: {
          summary: '人工录入事件，默认高置信度但仍需确认入库',
        },
        proposedChanges: {
          task: {
            title: '调整 VIP A 接送车辆等待时间',
            description: '同步司机、接待负责人和停车点等待安排。',
            moduleName: modules[3]?.name || stageModule,
            ownerName: owner,
            priority: 'HIGH',
            dueTime: dueSoon.toISOString(),
          },
        },
      }),
    ]);

    return {
      success: true,
      count: events.length,
      events,
    };
  }
}
