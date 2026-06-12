import { Injectable } from '@nestjs/common';
import {
  EventStatus,
  Prisma,
  TaskPriority,
  VisibilityScope,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectByIdentifier(identifier: string) {
    return this.prisma.project.findFirst({
      where: {
        OR: [{ id: identifier }, { code: identifier }],
      },
    });
  }

  upsertSystemUser() {
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

  findEventWithProject(eventId: string) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: { project: true },
    });
  }

  findEventDetail(eventId: string) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        project: true,
        createdBy: true,
        confirmedBy: true,
      },
    });
  }

  findProjectModuleByName(projectId: string, name: string) {
    return this.prisma.projectModule.findFirst({
      where: { projectId, name },
    });
  }

  findProjectMemberByName(projectId: string, name: string) {
    return this.prisma.projectMember.findFirst({
      where: {
        projectId,
        user: { name },
      },
      include: { user: true },
    });
  }

  createTaskFromEventData(params: {
    projectId: string;
    moduleId?: string | null;
    title: string;
    description?: string | null;
    priority?: TaskPriority;
    ownerId?: string | null;
    ownerMemberId?: string | null;
    assistantId?: string | null;
    assistantMemberId?: string | null;
    startTime?: Date;
    dueTime?: Date;
    createdById: string;
  }) {
    return this.prisma.task.create({
      data: {
        projectId: params.projectId,
        moduleId: params.moduleId,
        title: params.title,
        description: params.description,
        priority: params.priority || TaskPriority.MEDIUM,
        ownerId: params.ownerId,
        ownerMemberId: params.ownerMemberId,
        assistantId: params.assistantId,
        assistantMemberId: params.assistantMemberId,
        startTime: params.startTime,
        dueTime: params.dueTime,
        createdById: params.createdById,
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

  createEvent(projectId: string, dto: CreateEventDto, confidence: Prisma.Decimal | null) {
    return this.prisma.event.create({
      data: {
        projectId,
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

  findEvents(projectId: string, query: ListEventsQueryDto) {
    return this.prisma.event.findMany({
      where: {
        projectId,
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

  updateEvent(
    eventId: string,
    data: Prisma.EventUpdateInput | Prisma.EventUncheckedUpdateInput,
  ) {
    return this.prisma.event.update({
      where: { id: eventId },
      data,
      include: {
        createdBy: true,
        confirmedBy: true,
      },
    });
  }

  findProjectModules(projectId: string) {
    return this.prisma.projectModule.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  findProjectMembers(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId, status: 'ACTIVE' },
      include: { user: true },
    });
  }

  deleteDemoSeedEvents(projectId: string) {
    return this.prisma.event.deleteMany({
      where: {
        projectId,
        sourceChannel: 'demo_event_seed',
      },
    });
  }
}
