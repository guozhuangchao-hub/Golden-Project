import { Injectable } from '@nestjs/common';
import {
  EventSourceType,
  EventStatus,
  MessageSignalType,
  Prisma,
  TaskPriority,
  VisibilityScope,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type SignalInputMessage = {
  sourceMessageId: string;
  sourceChannel?: string | null;
  senderName?: string | null;
  content: string;
  receivedAt: Date;
};

type SignalContext = {
  projectId: string;
  sourceType: EventSourceType;
  moduleNames?: string[];
  memberNames?: string[];
};

export type ExtractedSignal = {
  sourceMessageId: string;
  sourceChannel?: string | null;
  senderName?: string | null;
  signalType: MessageSignalType;
  summary: string;
  confidence: number;
  payload: Record<string, any>;
};

@Injectable()
export class OpsSignalsService {
  constructor(private readonly prisma: PrismaService) {}

  extractSignals(messages: SignalInputMessage[], context: SignalContext) {
    const seen = new Set<string>();
    const results: ExtractedSignal[] = [];

    for (const message of messages) {
      for (const line of this.splitCandidateLines(message.content)) {
        const signal = this.classifyLine(line, message, context);
        if (!signal) {
          continue;
        }

        const key = [
          message.sourceMessageId,
          signal.signalType,
          this.normalizeKey(signal.summary),
        ].join('|');
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        results.push(signal);
      }
    }

    return results;
  }

  async persistSignals(context: SignalContext, signals: ExtractedSignal[]) {
    const saved: any[] = [];
    for (const signal of signals) {
      const duplicate = await this.prisma.messageSignal.findFirst({
        where: {
          projectId: context.projectId,
          sourceType: context.sourceType,
          sourceMessageId: signal.sourceMessageId,
          signalType: signal.signalType,
          summary: signal.summary,
        },
      });

      if (duplicate) {
        saved.push(duplicate);
        continue;
      }

      const record = await this.prisma.messageSignal.create({
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
      saved.push(record);
    }

    return saved;
  }

  async createPendingEventsFromSignals(params: {
    projectId: string;
    sourceType: EventSourceType;
    systemUserId: string;
    signals: ExtractedSignal[];
  }) {
    const createdEventIds: string[] = [];

    for (const signal of params.signals) {
      if (
        signal.signalType !== MessageSignalType.TASK_CANDIDATE &&
        signal.signalType !== MessageSignalType.RISK_SIGNAL &&
        signal.signalType !== MessageSignalType.HELP_REQUEST
      ) {
        continue;
      }

      const event = await this.prisma.event.create({
        data: {
          projectId: params.projectId,
          eventType: this.eventTypeForSignal(signal.signalType),
          title: signal.summary,
          description: String(signal.payload.description || signal.summary),
          status: EventStatus.pending_review,
          confidence: signal.confidence,
          sourceType: params.sourceType,
          sourceChannel: signal.sourceChannel,
          sourceSender: signal.senderName,
          sourceSenderRole: 'staff',
          rawContent: String(signal.payload.rawText || signal.summary),
          visibilityScope: VisibilityScope.admin,
          aiResult: {
            sourceMessageId: signal.sourceMessageId,
            signalType: signal.signalType,
          },
          proposedChanges: this.buildProposedChanges(signal),
          createdById: params.systemUserId,
        },
      });

      createdEventIds.push(event.id);
    }

    return createdEventIds;
  }

  taskCandidatesFromSignals(signals: ExtractedSignal[]) {
    return signals
      .filter((signal) => signal.signalType === MessageSignalType.TASK_CANDIDATE)
      .map((signal) => ({
        title: String(signal.payload.title || signal.summary),
        description: String(signal.payload.description || signal.summary),
        moduleName: signal.payload.moduleName ? String(signal.payload.moduleName) : null,
        ownerName: signal.payload.ownerName ? String(signal.payload.ownerName) : null,
        assistantName: signal.payload.assistantName ? String(signal.payload.assistantName) : null,
        priority: String(signal.payload.priority || TaskPriority.MEDIUM),
        dueTime: signal.payload.dueTime ? String(signal.payload.dueTime) : null,
        sourceMessageId: signal.sourceMessageId,
        sourceMessageText: String(signal.payload.rawText || signal.summary),
      }));
  }

  buildSignalSummary(projectName: string, messageCount: number, signals: ExtractedSignal[]) {
    const taskCount = signals.filter((item) => item.signalType === MessageSignalType.TASK_CANDIDATE).length;
    const riskCount = signals.filter((item) => item.signalType === MessageSignalType.RISK_SIGNAL).length;
    const helpCount = signals.filter((item) => item.signalType === MessageSignalType.HELP_REQUEST).length;
    const progressCount = signals.filter((item) => item.signalType === MessageSignalType.PROGRESS_UPDATE).length;

    return [
      `项目「${projectName}」本次共读取 ${messageCount} 条消息。`,
      `识别到 ${taskCount} 个任务候选，${riskCount} 个风险信号，${helpCount} 个求助信号，${progressCount} 个进度反馈。`,
    ].join(' ');
  }

  private classifyLine(line: string, message: SignalInputMessage, context: SignalContext) {
    const cleaned = line.trim().replace(/^[\-\*\d.、\s]+/, '');
    if (!cleaned) {
      return null;
    }

    const normalized = cleaned.replace(/\s+/g, ' ');
    if (this.isContactUpdate(normalized)) {
      return this.buildContactSignal(normalized, message);
    }
    if (this.isHelpRequest(normalized)) {
      return this.buildHelpSignal(normalized, message, context);
    }
    if (this.isRiskSignal(normalized)) {
      return this.buildRiskSignal(normalized, message, context);
    }
    if (this.isProgressUpdate(normalized)) {
      return this.buildProgressSignal(normalized, message, context);
    }
    if (this.isTaskCandidate(normalized)) {
      return this.buildTaskSignal(normalized, message, context);
    }

    return null;
  }

  private buildTaskSignal(text: string, message: SignalInputMessage, context: SignalContext): ExtractedSignal {
    const moduleName = context.moduleNames?.find((name) => text.includes(name)) || null;
    const ownerName = this.matchOwnerName(text, context.memberNames || []);
    const assistantName = this.matchAssistant(text, context.memberNames || []);
    const dueTime = this.matchDueTime(text);
    const priority = this.matchPriority(text);
    const title = text.length > 60 ? `${text.slice(0, 57)}...` : text;

    return {
      sourceMessageId: message.sourceMessageId,
      sourceChannel: message.sourceChannel,
      senderName: message.senderName,
      signalType: MessageSignalType.TASK_CANDIDATE,
      summary: title,
      confidence: 0.72,
      payload: {
        title,
        description: text,
        moduleName,
        ownerName,
        assistantName,
        dueTime,
        priority,
        rawText: text,
        receivedAt: message.receivedAt.toISOString(),
      },
    };
  }

  private buildRiskSignal(text: string, message: SignalInputMessage, context: SignalContext): ExtractedSignal {
    const moduleName = context.moduleNames?.find((name) => text.includes(name)) || null;
    return {
      sourceMessageId: message.sourceMessageId,
      sourceChannel: message.sourceChannel,
      senderName: message.senderName,
      signalType: MessageSignalType.RISK_SIGNAL,
      summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      confidence: 0.78,
      payload: {
        description: text,
        moduleName,
        rawText: text,
        severity: this.matchRiskSeverity(text),
        receivedAt: message.receivedAt.toISOString(),
      },
    };
  }

  private buildHelpSignal(text: string, message: SignalInputMessage, context: SignalContext): ExtractedSignal {
    const moduleName = context.moduleNames?.find((name) => text.includes(name)) || null;
    return {
      sourceMessageId: message.sourceMessageId,
      sourceChannel: message.sourceChannel,
      senderName: message.senderName,
      signalType: MessageSignalType.HELP_REQUEST,
      summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      confidence: 0.84,
      payload: {
        description: text,
        moduleName,
        ownerName: this.matchOwnerName(text, context.memberNames || []),
        rawText: text,
        receivedAt: message.receivedAt.toISOString(),
      },
    };
  }

  private buildProgressSignal(text: string, message: SignalInputMessage, context: SignalContext): ExtractedSignal {
    return {
      sourceMessageId: message.sourceMessageId,
      sourceChannel: message.sourceChannel,
      senderName: message.senderName,
      signalType: MessageSignalType.PROGRESS_UPDATE,
      summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      confidence: 0.67,
      payload: {
        description: text,
        ownerName: this.matchOwnerName(text, context.memberNames || []),
        rawText: text,
        receivedAt: message.receivedAt.toISOString(),
      },
    };
  }

  private buildContactSignal(text: string, message: SignalInputMessage): ExtractedSignal {
    return {
      sourceMessageId: message.sourceMessageId,
      sourceChannel: message.sourceChannel,
      senderName: message.senderName,
      signalType: MessageSignalType.CONTACT_UPDATE,
      summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      confidence: 0.63,
      payload: {
        description: text,
        rawText: text,
        receivedAt: message.receivedAt.toISOString(),
      },
    };
  }

  private buildProposedChanges(signal: ExtractedSignal) {
    if (signal.signalType === MessageSignalType.TASK_CANDIDATE) {
      return {
        task: {
          title: signal.payload.title,
          description: signal.payload.description,
          moduleName: signal.payload.moduleName,
          ownerName: signal.payload.ownerName,
          assistantName: signal.payload.assistantName,
          dueTime: signal.payload.dueTime,
          priority: signal.payload.priority,
        },
      };
    }

    return {
      signal: {
        type: signal.signalType,
        summary: signal.summary,
        payload: signal.payload,
      },
    };
  }

  private eventTypeForSignal(signalType: MessageSignalType) {
    switch (signalType) {
      case MessageSignalType.RISK_SIGNAL:
        return 'risk_signal';
      case MessageSignalType.HELP_REQUEST:
        return 'help_request';
      default:
        return 'task_candidate';
    }
  }

  private splitCandidateLines(content: string) {
    return content
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private isTaskCandidate(text: string) {
    return /(任务|待办|确认|安排|协调|对接|处理|推进|补充|跟进|提醒|同步|核对|提交|发送|准备|落实|排查|更新)/.test(text);
  }

  private isRiskSignal(text: string) {
    return /(风险|来不及|延误|延期|冲突|故障|缺少|没到|未到|取消|有问题|异常|逾期|卡点|赶不上)/.test(text);
  }

  private isProgressUpdate(text: string) {
    return /(已完成|完成了|已经|已对接|已发送|已落实|进度|更新一下|已确认|完成情况|处理完)/.test(text);
  }

  private isHelpRequest(text: string) {
    return /(求助|帮忙|支援|协助|卡住|不会|怎么处理|怎么办|谁来|需要支持)/.test(text);
  }

  private isContactUpdate(text: string) {
    return /(联系人|电话|手机号|微信|加一下|对接人|负责人是)/.test(text);
  }

  private matchOwnerName(text: string, memberNames: string[]) {
    return (
      memberNames.find((name) => text.includes(name)) ||
      text.match(/@([\u4e00-\u9fa5A-Za-z0-9_·-]{2,20})/)?.[1] ||
      null
    );
  }

  private matchAssistant(text: string, memberNames: string[]) {
    if (!/(协助|支援|配合|帮忙)/.test(text)) {
      return null;
    }
    return memberNames.find((name) => text.includes(name)) || null;
  }

  private matchDueTime(text: string) {
    const match =
      text.match(/(\d{1,2})[:：](\d{2})/) ||
      text.match(/(\d{1,2})点(?:([0-5]?\d)分?)?/) ||
      text.match(/(今天|明天|后天)/);

    if (!match) {
      return null;
    }

    if (match[1] === '今天' || match[1] === '明天' || match[1] === '后天') {
      const offset = match[1] === '今天' ? 0 : match[1] === '明天' ? 1 : 2;
      const due = new Date();
      due.setDate(due.getDate() + offset);
      due.setHours(18, 0, 0, 0);
      return due.toISOString();
    }

    let hours = Number(match[1]);
    const minutes = Number(match[2] || match[3] || 0);
    if (/(下午|晚上|今晚)/.test(text) && hours < 12) {
      hours += 12;
    }
    const due = new Date();
    due.setHours(hours, minutes, 0, 0);
    return due.toISOString();
  }

  private matchPriority(text: string) {
    if (/(紧急|马上|立即|尽快|今天必须|高优先|下班前|今晚)/.test(text)) {
      return TaskPriority.HIGH;
    }
    if (/(重要|优先|先处理)/.test(text)) {
      return TaskPriority.HIGH;
    }
    if (/(不急|低优先|有空)/.test(text)) {
      return TaskPriority.LOW;
    }
    return TaskPriority.MEDIUM;
  }

  private matchRiskSeverity(text: string) {
    if (/(来不及|赶不上|取消|故障|严重|无法)/.test(text)) {
      return 'high';
    }
    if (/(延误|缺少|冲突|问题)/.test(text)) {
      return 'medium';
    }
    return 'low';
  }

  private normalizeKey(text: string) {
    return text.replace(/\s+/g, '').replace(/[，。！？!?、:：]/g, '').slice(0, 80);
  }
}
