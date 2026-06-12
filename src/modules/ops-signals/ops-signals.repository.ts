import { Injectable } from '@nestjs/common';
import { EventSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtractedSignal, SignalContext } from './ops-signals.types';

@Injectable()
export class OpsSignalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDuplicateSignal(context: SignalContext, signal: ExtractedSignal) {
    return this.prisma.messageSignal.findFirst({
      where: {
        projectId: context.projectId,
        sourceType: context.sourceType,
        sourceMessageId: signal.sourceMessageId,
        signalType: signal.signalType,
        summary: signal.summary,
      },
    });
  }

  createSignal(context: SignalContext, signal: ExtractedSignal) {
    return this.prisma.messageSignal.create({
      data: {
        projectId: context.projectId,
        sourceType: context.sourceType,
        sourceMessageId: signal.sourceMessageId,
        sourceChannel: signal.sourceChannel ?? undefined,
        senderName: signal.senderName ?? undefined,
        signalType: signal.signalType,
        summary: signal.summary,
        confidence: signal.confidence,
        payload: signal.payload as Prisma.InputJsonValue,
      },
    });
  }

  createPendingEventFromSignal(params: {
    projectId: string;
    sourceType: EventSourceType;
    systemUserId: string;
    signal: ExtractedSignal;
    proposedChanges: Prisma.InputJsonValue;
  }) {
    return this.prisma.event.create({
      data: {
        projectId: params.projectId,
        eventType: params.signal.eventType,
        title: params.signal.summary,
        description: params.signal.payload.description || params.signal.summary,
        status: 'pending_review',
        confidence: params.signal.confidence,
        sourceType: params.sourceType,
        sourceChannel: params.signal.sourceChannel,
        sourceSender: params.signal.senderName,
        sourceSenderRole: 'staff',
        rawContent: params.signal.payload.rawText || params.signal.summary,
        visibilityScope: 'admin',
        aiResult: {
          sourceMessageId: params.signal.sourceMessageId,
          signalType: params.signal.signalType,
        },
        proposedChanges: params.proposedChanges,
        createdById: params.systemUserId,
      },
    });
  }
}
