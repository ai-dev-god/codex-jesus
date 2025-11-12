import type { CloudTaskMetadata, PrismaClient } from '@prisma/client';

import prismaClient from '../lib/prisma';
import { alerting, type AlertingClient } from '../modules/observability-ops/alerting';
import { NOTIFICATIONS_RETRY_CONFIG, type NotificationTaskPayload, type NotificationType } from '../modules/notifications/notifications-queue';
import { resendEmailClient, type ResendEmailClient } from '../modules/notifications/resend-client';
import { buildNotificationEmail } from '../modules/notifications/templates';

type NotificationWorkerDeps = {
  prisma?: PrismaClient;
  resend?: ResendEmailClient;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  alerting?: AlertingClient;
  now?: () => Date;
};

const parseNotificationPayload = (metadataPayload: unknown): NotificationTaskPayload | null => {
  if (!metadataPayload || typeof metadataPayload !== 'object') {
    return null;
  }

  const outer = metadataPayload as Record<string, unknown>;
  const inner = outer.payload;
  if (!inner || typeof inner !== 'object') {
    return null;
  }

  const payload = inner as Record<string, unknown>;
  const type = typeof payload.type === 'string' ? (payload.type as NotificationType) : null;
  const channel = typeof payload.channel === 'string' ? payload.channel : 'email';
  const recipientRecord = payload.recipient;
  const data = payload.data;

  if (
    !type ||
    channel !== 'email' ||
    !recipientRecord ||
    typeof recipientRecord !== 'object' ||
    !data ||
    typeof data !== 'object'
  ) {
    return null;
  }

  const recipientObj = recipientRecord as Record<string, unknown>;
  const recipientId = typeof recipientObj.id === 'string' ? recipientObj.id : null;
  const recipientEmail = typeof recipientObj.email === 'string' ? recipientObj.email : null;
  const displayName = typeof recipientObj.displayName === 'string' ? recipientObj.displayName : '';

  if (!recipientId || !recipientEmail) {
    return null;
  }

  return {
    type,
    channel: 'email',
    recipient: {
      id: recipientId,
      email: recipientEmail,
      displayName
    },
    data: data as NotificationTaskPayload['data']
  } as NotificationTaskPayload;
};

const resolveMaxAttempts = (metadata: CloudTaskMetadata): number => {
  const payload = metadata.payload;
  if (!payload || typeof payload !== 'object') {
    return NOTIFICATIONS_RETRY_CONFIG.maxAttempts;
  }

  const record = payload as Record<string, unknown>;
  const retry = record.retry;
  if (!retry || typeof retry !== 'object') {
    return NOTIFICATIONS_RETRY_CONFIG.maxAttempts;
  }

  const retryRecord = retry as Record<string, unknown>;
  const raw = retryRecord.maxAttempts;
  const parsed = typeof raw === 'number' ? raw : Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : NOTIFICATIONS_RETRY_CONFIG.maxAttempts;
};

export const createNotificationWorker = (deps: NotificationWorkerDeps = {}) => {
  const prisma = deps.prisma ?? prismaClient;
  const resend = deps.resend ?? resendEmailClient;
  const logger = deps.logger ?? console;
  const alertClient = deps.alerting ?? alerting;
  const now = deps.now ?? (() => new Date());

  return async (taskName: string): Promise<void> => {
    const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
    if (!metadata) {
      logger.warn?.(`[notifications] No task metadata found for ${taskName}`);
      return;
    }

    const attemptTimestamp = now();
    const attemptCount = metadata.attemptCount + 1;
    const maxAttempts = resolveMaxAttempts(metadata);

    const payload = parseNotificationPayload(metadata.payload);
    if (!payload) {
      logger.error?.('[notifications] Task payload missing required fields', {
        taskName,
        payload: metadata.payload
      });
      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'FAILED',
          attemptCount,
          firstAttemptAt: metadata.firstAttemptAt ?? attemptTimestamp,
          lastAttemptAt: attemptTimestamp,
          errorMessage: 'Notification payload is invalid'
        }
      });

      if (attemptCount >= maxAttempts) {
        await alertClient.notify('notifications.dead_letter', {
          taskName,
          reason: 'invalid-payload'
        });
      }
      return;
    }

    const email = buildNotificationEmail(payload);

    try {
      await resend.sendEmail({
        to: payload.recipient.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        from: email.from,
        tags: email.tags
      });

      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'SUCCEEDED',
          attemptCount,
          firstAttemptAt: metadata.firstAttemptAt ?? attemptTimestamp,
          lastAttemptAt: attemptTimestamp,
          errorMessage: null
        }
      });

      logger.info?.('[notifications] Delivered notification', {
        type: payload.type,
        recipientId: payload.recipient.id,
        taskName
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown notification failure';

      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'FAILED',
          attemptCount,
          firstAttemptAt: metadata.firstAttemptAt ?? attemptTimestamp,
          lastAttemptAt: attemptTimestamp,
          errorMessage: message
        }
      });

      logger.error?.('[notifications] Failed to deliver notification', {
        type: payload.type,
        recipientId: payload.recipient.id,
        taskName,
        error: message
      });

      if (attemptCount >= maxAttempts) {
        await alertClient.notify('notifications.dead_letter', {
          taskName,
          type: payload.type,
          recipientId: payload.recipient.id,
          error: message
        });
      }
    }
  };
};

export const notificationWorker = createNotificationWorker();
