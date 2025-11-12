import type { CloudTaskMetadata, PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import {
  enqueueNotificationTask,
  NOTIFICATIONS_QUEUE,
  type NotificationPayloadMap,
  type NotificationRecipient,
  type NotificationTaskPayload,
  type NotificationType
} from './notifications-queue';

type ScheduleOptions = {
  sendAt?: Date;
};

type InsightAlertInput = {
  recipientId: string;
  insightId: string;
  insightTitle: string;
  summary?: string;
} & ScheduleOptions;

type StreakType = NotificationPayloadMap['STREAK_NUDGE']['streakType'];

type StreakNudgeInput = {
  recipientId: string;
  streakType: StreakType;
  currentStreak: number;
} & ScheduleOptions;

type ModerationNoticeInput = {
  recipientId: string;
  flagId: string;
  status: string;
  reason?: string;
} & ScheduleOptions;

type OnboardingWelcomeInput = {
  recipientId: string;
  loginUrl?: string;
  supportEmail?: string;
} & ScheduleOptions;

type CommunityEventInput = {
  recipientId: string;
  eventId: string;
  eventName: string;
  eventStartsAt?: string;
  ctaUrl?: string;
} & ScheduleOptions;

type NotificationServiceOptions = Partial<{
  now: () => Date;
  enqueue: typeof enqueueNotificationTask;
}>;

type RateLimitConfig = {
  limit: number;
  windowMinutes: number;
};

const RATE_LIMITS: Record<NotificationType, RateLimitConfig> = {
  INSIGHT_ALERT: { limit: 3, windowMinutes: 60 },
  STREAK_NUDGE: { limit: 2, windowMinutes: 120 },
  MODERATION_NOTICE: { limit: 5, windowMinutes: 1440 },
  ONBOARDING_WELCOME: { limit: 1, windowMinutes: 1440 },
  COMMUNITY_EVENT: { limit: 4, windowMinutes: 1440 }
};

const parseSummary = (
  raw: Pick<CloudTaskMetadata, 'payload'>
): { type: NotificationType | null; recipientId: string | null } => {
  if (!raw.payload || typeof raw.payload !== 'object') {
    return { type: null, recipientId: null };
  }

  const outer = raw.payload as Record<string, unknown>;
  const inner = outer.payload;
  if (!inner || typeof inner !== 'object') {
    return { type: null, recipientId: null };
  }

  const payload = inner as Record<string, unknown>;
  const type = typeof payload.type === 'string' ? (payload.type as NotificationType) : null;

  const recipientRecord = payload.recipient;
  const recipientId =
    recipientRecord && typeof recipientRecord === 'object'
      ? (() => {
          const id = (recipientRecord as Record<string, unknown>).id;
          return typeof id === 'string' ? id : null;
        })()
      : null;

  return { type, recipientId };
};

export class NotificationService {
  private readonly now: () => Date;
  private readonly enqueue: typeof enqueueNotificationTask;

  constructor(private readonly prisma: PrismaClient, options: NotificationServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.enqueue = options.enqueue ?? enqueueNotificationTask;
  }

  private async resolveRecipient(recipientId: string): Promise<NotificationRecipient> {
    const user = await this.prisma.user.findUnique({
      where: { id: recipientId },
      include: { profile: true }
    });

    if (!user) {
      throw new HttpError(
        404,
        'Notification recipient was not found.',
        'NOTIFICATION_RECIPIENT_NOT_FOUND',
        { recipientId }
      );
    }

    const displayName =
      (user.profile as { displayName?: string | null } | null)?.displayName ?? user.email;

    return {
      id: user.id,
      email: user.email,
      displayName
    };
  }

  private async enforceRateLimit(recipientId: string, type: NotificationType): Promise<void> {
    const config = RATE_LIMITS[type];
    if (!config) {
      return;
    }

    const windowStart = new Date(this.now().getTime() - config.windowMinutes * 60 * 1000);
    const recent = await this.prisma.cloudTaskMetadata.findMany({
      where: {
        queue: NOTIFICATIONS_QUEUE,
        createdAt: {
          gte: windowStart
        }
      },
      select: {
        payload: true
      }
    });

    let count = 0;
    for (const record of recent) {
      const summary = parseSummary(record);
      if (summary.type === type && summary.recipientId === recipientId) {
        count += 1;
      }
    }

    if (count >= config.limit) {
      throw new HttpError(
        429,
        'Notification rate limit exceeded.',
        'NOTIFICATION_RATE_LIMITED',
        {
          type,
          recipientId,
          limit: config.limit,
          windowMinutes: config.windowMinutes
        }
      );
    }
  }

  private toScheduleOptions(options: ScheduleOptions) {
    return {
      scheduleTime: options.sendAt ?? null
    };
  }

  async scheduleInsightAlert(
    actorId: string,
    input: InsightAlertInput
  ): Promise<CloudTaskMetadata> {
    const recipient = await this.resolveRecipient(input.recipientId);
    await this.enforceRateLimit(recipient.id, 'INSIGHT_ALERT');

    const payload: NotificationTaskPayload<'INSIGHT_ALERT'> = {
      type: 'INSIGHT_ALERT',
      channel: 'email',
      recipient,
      data: {
        insightId: input.insightId,
        insightTitle: input.insightTitle,
        summary: input.summary,
        triggeredAt: this.now().toISOString(),
        triggeredBy: { id: actorId }
      }
    };

    return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
  }

  async scheduleStreakNudge(actorId: string, input: StreakNudgeInput): Promise<CloudTaskMetadata> {
    const recipient = await this.resolveRecipient(input.recipientId);
    await this.enforceRateLimit(recipient.id, 'STREAK_NUDGE');

    const payload: NotificationTaskPayload<'STREAK_NUDGE'> = {
      type: 'STREAK_NUDGE',
      channel: 'email',
      recipient,
      data: {
        streakType: input.streakType,
        currentStreak: input.currentStreak,
        triggeredAt: this.now().toISOString(),
        triggeredBy: { id: actorId }
      }
    };

    return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
  }

  async scheduleModerationNotice(
    actorId: string,
    input: ModerationNoticeInput
  ): Promise<CloudTaskMetadata> {
    const recipient = await this.resolveRecipient(input.recipientId);
    await this.enforceRateLimit(recipient.id, 'MODERATION_NOTICE');

    const payload: NotificationTaskPayload<'MODERATION_NOTICE'> = {
      type: 'MODERATION_NOTICE',
      channel: 'email',
      recipient,
      data: {
        flagId: input.flagId,
        status: input.status,
        reason: input.reason,
        triggeredAt: this.now().toISOString(),
        triggeredBy: { id: actorId }
      }
    };

    return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
  }

  async scheduleOnboardingWelcome(
    actorId: string | null,
    input: OnboardingWelcomeInput
  ): Promise<CloudTaskMetadata> {
    const recipient = await this.resolveRecipient(input.recipientId);
    await this.enforceRateLimit(recipient.id, 'ONBOARDING_WELCOME');

    const data: NotificationPayloadMap['ONBOARDING_WELCOME'] = {
      loginUrl: input.loginUrl,
      supportEmail: input.supportEmail,
      triggeredAt: this.now().toISOString()
    };

    if (actorId) {
      data.triggeredBy = { id: actorId };
    }

    const payload: NotificationTaskPayload<'ONBOARDING_WELCOME'> = {
      type: 'ONBOARDING_WELCOME',
      channel: 'email',
      recipient,
      data
    };

    return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
  }

  async scheduleCommunityEvent(
    actorId: string,
    input: CommunityEventInput
  ): Promise<CloudTaskMetadata> {
    const recipient = await this.resolveRecipient(input.recipientId);
    await this.enforceRateLimit(recipient.id, 'COMMUNITY_EVENT');

    const payload: NotificationTaskPayload<'COMMUNITY_EVENT'> = {
      type: 'COMMUNITY_EVENT',
      channel: 'email',
      recipient,
      data: {
        eventId: input.eventId,
        eventName: input.eventName,
        eventStartsAt: input.eventStartsAt,
        ctaUrl: input.ctaUrl,
        triggeredAt: this.now().toISOString(),
        triggeredBy: { id: actorId }
      }
    };

    return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
  }
}

export const notificationService = new NotificationService(prismaClient);
export type {
  InsightAlertInput,
  StreakNudgeInput,
  ModerationNoticeInput,
  OnboardingWelcomeInput,
  CommunityEventInput
};
