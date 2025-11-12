import type { Prisma, PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';

export const NOTIFICATIONS_QUEUE = 'notifications-dispatch';

export const NOTIFICATIONS_RETRY_CONFIG = {
  maxAttempts: 5,
  minBackoffSeconds: 60,
  maxBackoffSeconds: 900
} as const;

export type NotificationType =
  | 'INSIGHT_ALERT'
  | 'STREAK_NUDGE'
  | 'MODERATION_NOTICE'
  | 'ONBOARDING_WELCOME'
  | 'COMMUNITY_EVENT';

export type NotificationChannel = 'email';

export type NotificationRecipient = {
  id: string;
  email: string;
  displayName: string;
};

export type NotificationPayloadMap = {
  INSIGHT_ALERT: {
    insightId: string;
    insightTitle: string;
    summary?: string;
    triggeredAt: string;
    triggeredBy?: {
      id: string;
    };
  };
  STREAK_NUDGE: {
    streakType: 'INSIGHTS' | 'LOGGING' | 'COMMUNITY';
    currentStreak: number;
    triggeredAt: string;
    triggeredBy?: {
      id: string;
    };
  };
  MODERATION_NOTICE: {
    flagId: string;
    status: string;
    reason?: string;
    triggeredAt: string;
    triggeredBy: {
      id: string;
    };
  };
  ONBOARDING_WELCOME: {
    loginUrl?: string;
    supportEmail?: string;
    triggeredAt: string;
    triggeredBy?: {
      id: string;
    };
  };
  COMMUNITY_EVENT: {
    eventId: string;
    eventName: string;
    eventStartsAt?: string;
    ctaUrl?: string;
    triggeredAt: string;
    triggeredBy?: {
      id: string;
    };
  };
};

export type NotificationTaskPayload<TType extends NotificationType = NotificationType> = {
  type: TType;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  data: NotificationPayloadMap[TType];
};

type EnqueueOptions = {
  scheduleTime?: Date | null;
  taskName?: string;
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export const enqueueNotificationTask = async (
  prisma: PrismaClient,
  payload: NotificationTaskPayload,
  options: EnqueueOptions = {}
) => {
  const taskName =
    options.taskName ?? `notifications-dispatch-${payload.recipient.id}-${Date.now().toString(36)}`;

  return prisma.cloudTaskMetadata.create({
    data: {
      taskName,
      queue: NOTIFICATIONS_QUEUE,
      payload: toJsonValue({
        payload,
        retry: NOTIFICATIONS_RETRY_CONFIG
      }),
      scheduleTime: options.scheduleTime ?? null,
      status: 'PENDING'
    }
  });
};

export const notificationsQueue = {
  queue: NOTIFICATIONS_QUEUE,
  retryConfig: NOTIFICATIONS_RETRY_CONFIG,
  enqueue: (payload: NotificationTaskPayload, options?: EnqueueOptions) =>
    enqueueNotificationTask(prismaClient, payload, options)
};
