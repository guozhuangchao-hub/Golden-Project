import { Injectable } from '@nestjs/common';
import { AgentInboundEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpsertAgentIntegrationDto } from './dto/upsert-agent-integration.dto';

type AgentWebhookPayload = Record<string, any>;

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  getIntegration(projectId: string, provider: string) {
    return this.prisma.agentIntegrationSetting.findUnique({
      where: {
        projectId_provider: {
          projectId,
          provider,
        },
      },
      include: {
        project: true,
        events: {
          orderBy: { receivedAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  upsertIntegration(projectId: string, dto: UpsertAgentIntegrationDto) {
    return this.prisma.agentIntegrationSetting.upsert({
      where: {
        projectId_provider: {
          projectId,
          provider: dto.provider,
        },
      },
      create: {
        projectId,
        provider: dto.provider,
        displayName: dto.displayName,
        webhookUrl: dto.webhookUrl,
        webhookSecret: dto.webhookSecret,
        enabled: dto.enabled ?? true,
        capabilities: dto.capabilities as Prisma.InputJsonValue | undefined,
      },
      update: {
        displayName: dto.displayName,
        webhookUrl: dto.webhookUrl,
        webhookSecret: dto.webhookSecret,
        enabled: dto.enabled,
        capabilities: dto.capabilities as Prisma.InputJsonValue | undefined,
      },
      include: {
        project: true,
        events: {
          orderBy: { receivedAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  listEvents(projectId: string, provider?: string) {
    return this.prisma.agentInboundEvent.findMany({
      where: {
        projectId,
        ...(provider ? { provider } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: 100,
      include: {
        integration: true,
      },
    });
  }

  async handleWebhook(payload: AgentWebhookPayload) {
    if (payload?.challenge) {
      return { challenge: payload.challenge };
    }

    const provider = String(payload?.provider || payload?.header?.provider || 'unknown');
    const projectId = String(payload?.projectId || payload?.project_id || '');
    const eventType = String(payload?.eventType || payload?.event_type || 'unknown');
    const externalEventId = payload?.eventId || payload?.event_id || null;

    if (!projectId) {
      return { ok: false, reason: 'missing_project_id' };
    }

    const integration = await this.prisma.agentIntegrationSetting.findFirst({
      where: {
        projectId,
        provider,
      },
    });

    const record = await this.prisma.agentInboundEvent.create({
      data: {
        projectId,
        integrationId: integration?.id ?? null,
        provider,
        eventType,
        externalEventId: externalEventId ? String(externalEventId) : undefined,
        payload: payload as Prisma.InputJsonValue,
        status: integration?.enabled ? AgentInboundEventStatus.NEW : AgentInboundEventStatus.IGNORED,
        processedAt: integration?.enabled ? undefined : new Date(),
      },
    });

    return {
      ok: true,
      eventId: record.id,
      accepted: Boolean(integration?.enabled),
    };
  }

  async acknowledgeEvent(eventId: string, note?: string) {
    return this.prisma.agentInboundEvent.update({
      where: { id: eventId },
      data: {
        status: AgentInboundEventStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: note ?? null,
      },
    });
  }
}
