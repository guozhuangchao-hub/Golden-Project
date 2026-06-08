import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AIReportType, RiskSeverity, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RisksService } from '../risks/risks.service';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private reminderTimer?: NodeJS.Timeout;
  private riskTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly risksService: RisksService,
  ) {}

  onModuleInit() {
    this.reminderTimer = setInterval(() => {
      void this.runReminderCycle();
    }, 5 * 60 * 1000);
    this.reminderTimer.unref?.();

    this.riskTimer = setInterval(() => {
      void this.runDailyRiskCycle();
    }, 60 * 60 * 1000);
    this.riskTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
    }
    if (this.riskTimer) {
      clearInterval(this.riskTimer);
    }
  }

  async runReminderCycle() {
    try {
      const overdueTasks = await this.prisma.task.findMany({
        where: {
          dueTime: { lt: new Date() },
          status: {
            in: [TaskStatus.PENDING_CONFIRMATION, TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
          },
        },
        select: { id: true },
      });

      const staleTasks = await this.prisma.task.findMany({
        where: {
          status: {
            in: [TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
          },
          OR: [
            { lastProgressAt: null, updatedAt: { lt: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
            { lastProgressAt: { lt: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
          ],
        },
        select: { id: true },
      });

      let remindersCreated = 0;
      for (const task of overdueTasks) {
        const result = await this.notificationsService.createOverdueTaskReminder(task.id);
        if (result.created) {
          remindersCreated += 1;
        }
      }
      for (const task of staleTasks) {
        const result = await this.notificationsService.createStaleTaskReminder(task.id);
        if (result.created) {
          remindersCreated += 1;
        }
      }

      const dispatched = await this.notificationsService.dispatchPending();
      return { remindersCreated, dispatched: dispatched.dispatched };
    } catch (error) {
      this.logger.warn(
        `Reminder cycle failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { remindersCreated: 0, dispatched: 0 };
    }
  }

  async runDailyRiskCycle() {
    try {
      const projects = await this.prisma.project.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
      });

      const reportDate = this.startOfDay(new Date());
      for (const project of projects) {
        const [overdueTasks, helpTasks, pendingEvents, signalRisks] = await Promise.all([
          this.prisma.task.findMany({
            where: {
              projectId: project.id,
              dueTime: { lt: new Date() },
              status: {
                in: [TaskStatus.PENDING_CONFIRMATION, TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
              },
            },
            include: {
              ownerMember: true,
            },
          }),
          this.prisma.task.findMany({
            where: {
              projectId: project.id,
              needsHelp: true,
              status: {
                in: [TaskStatus.PENDING_CONFIRMATION, TaskStatus.CONFIRMED, TaskStatus.IN_PROGRESS],
              },
            },
            include: {
              ownerMember: true,
            },
          }),
          this.prisma.event.findMany({
            where: {
              projectId: project.id,
              status: 'pending_review',
            },
          }),
          this.prisma.messageSignal.findMany({
            where: {
              projectId: project.id,
              signalType: 'RISK_SIGNAL',
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
        ]);

        for (const task of overdueTasks) {
          await this.risksService.upsertDerivedRisk({
            projectId: project.id,
            title: `逾期任务：${task.title}`,
            description: '任务已逾期，需要尽快确认当前进度和处理人。',
            severity:
              task.priority === 'URGENT' || task.priority === 'HIGH'
                ? RiskSeverity.HIGH
                : RiskSeverity.MEDIUM,
            sourceKind: 'task_overdue',
            sourceRefId: task.id,
            ownerMemberId: task.ownerMemberId,
            payload: {
              taskId: task.id,
              dueTime: task.dueTime?.toISOString() ?? null,
            },
          });
        }
        await this.risksService.resolveMissingDerivedRisks({
          projectId: project.id,
          sourceKind: 'task_overdue',
          activeSourceRefIds: overdueTasks.map((task) => task.id),
        });

        for (const task of helpTasks) {
          await this.risksService.upsertDerivedRisk({
            projectId: project.id,
            title: `求助任务：${task.title}`,
            description: '任务负责人已请求协助或反馈阻塞，需要经理关注。',
            severity: RiskSeverity.HIGH,
            sourceKind: 'task_help',
            sourceRefId: task.id,
            ownerMemberId: task.ownerMemberId,
            payload: {
              taskId: task.id,
              blockedAt: task.blockedAt?.toISOString() ?? null,
            },
          });
        }
        await this.risksService.resolveMissingDerivedRisks({
          projectId: project.id,
          sourceKind: 'task_help',
          activeSourceRefIds: helpTasks.map((task) => task.id),
        });

        for (const event of pendingEvents) {
          await this.risksService.upsertDerivedRisk({
            projectId: project.id,
            title: `待确认事项：${event.title}`,
            description: event.description || '存在待确认事项，尚未决定是否转成正式任务。',
            severity: RiskSeverity.MEDIUM,
            sourceKind: 'pending_event',
            sourceRefId: event.id,
            payload: {
              eventId: event.id,
              eventType: event.eventType,
              sourceType: event.sourceType,
            },
          });
        }
        await this.risksService.resolveMissingDerivedRisks({
          projectId: project.id,
          sourceKind: 'pending_event',
          activeSourceRefIds: pendingEvents.map((event) => event.id),
        });

        for (const signal of signalRisks) {
          await this.risksService.upsertDerivedRisk({
            projectId: project.id,
            title: `群内风险信号：${signal.summary}`,
            description: this.extractSignalDescription(signal.payload, signal.summary),
            severity: this.mapSignalSeverity(signal.payload),
            sourceKind: 'message_signal',
            sourceRefId: signal.id,
            payload: signal.payload as any,
          });
        }
        await this.risksService.resolveMissingDerivedRisks({
          projectId: project.id,
          sourceKind: 'message_signal',
          activeSourceRefIds: signalRisks.map((signal) => signal.id),
        });

        const overdueCount = overdueTasks.length;
        const helpCount = helpTasks.length;
        const pendingEventCount = pendingEvents.length;
        const signalRiskCount = signalRisks.length;

        const riskLevel =
          overdueCount >= 5 || helpCount >= 3 || signalRiskCount >= 3
            ? '高'
            : overdueCount >= 2 || helpCount >= 1 || pendingEventCount >= 3 || signalRiskCount >= 1
              ? '中'
              : '低';

        await this.prisma.aIReport.upsert({
          where: {
            projectId_reportDate_type: {
              projectId: project.id,
              reportDate,
              type: AIReportType.RISK,
            },
          },
          create: {
            projectId: project.id,
            reportDate,
            type: AIReportType.RISK,
            title: `${project.name} 风险扫描`,
            summary: `风险等级${riskLevel}，逾期${overdueCount}项，求助${helpCount}项，待确认事项${pendingEventCount}项，群内风险${signalRiskCount}项。`,
            content: [
              `风险等级：${riskLevel}`,
              `逾期任务：${overdueCount}`,
              `求助中任务：${helpCount}`,
              `待确认事项：${pendingEventCount}`,
              `群内风险信号：${signalRiskCount}`,
            ].join('\n'),
            generatedBy: 'phase-three-worker',
            sourceData: {
              overdueCount,
              helpCount,
              pendingEventCount,
              signalRiskCount,
            },
          },
          update: {
            title: `${project.name} 风险扫描`,
            summary: `风险等级${riskLevel}，逾期${overdueCount}项，求助${helpCount}项，待确认事项${pendingEventCount}项，群内风险${signalRiskCount}项。`,
            content: [
              `风险等级：${riskLevel}`,
              `逾期任务：${overdueCount}`,
              `求助中任务：${helpCount}`,
              `待确认事项：${pendingEventCount}`,
              `群内风险信号：${signalRiskCount}`,
            ].join('\n'),
            generatedBy: 'phase-three-worker',
            sourceData: {
              overdueCount,
              helpCount,
              pendingEventCount,
              signalRiskCount,
            },
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Risk cycle failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private startOfDay(input: Date) {
    const value = new Date(input);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private extractSignalDescription(payload: unknown, fallback: string) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'description' in payload) {
      return String((payload as Record<string, unknown>).description || fallback);
    }
    return fallback;
  }

  private mapSignalSeverity(payload: unknown) {
    const severity =
      payload && typeof payload === 'object' && !Array.isArray(payload) && 'severity' in payload
        ? String((payload as Record<string, unknown>).severity)
        : 'medium';

    if (severity === 'high') {
      return RiskSeverity.HIGH;
    }
    if (severity === 'low') {
      return RiskSeverity.LOW;
    }
    return RiskSeverity.MEDIUM;
  }
}
