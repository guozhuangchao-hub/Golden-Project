import { EventSourceType, MessageSignalType, TaskPriority } from '@prisma/client';

export type SignalInputMessage = {
  sourceMessageId: string;
  sourceChannel?: string | null;
  senderName?: string | null;
  content: string;
  receivedAt: Date;
};

export type SignalContext = {
  projectId: string;
  sourceType: EventSourceType;
  moduleNames?: string[];
  memberNames?: string[];
};

export type ExtractedSignalPayload = {
  title?: string;
  description?: string;
  moduleName?: string | null;
  ownerName?: string | null;
  assistantName?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority | string;
  rawText?: string;
  receivedAt?: string;
  severity?: 'low' | 'medium' | 'high';
};

export type ExtractedSignal = {
  sourceMessageId: string;
  sourceChannel?: string | null;
  senderName?: string | null;
  signalType: MessageSignalType;
  eventType: string;
  summary: string;
  confidence: number;
  payload: ExtractedSignalPayload;
};
