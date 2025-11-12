import type { PrismaClient } from '@prisma/client';

import prismaClient from '../lib/prisma';
import {
  WHOOP_SYNC_QUEUE,
  WHOOP_SYNC_RETRY_CONFIG,
  type WhoopSyncTaskPayload
} from '../modules/wearable/whoop-sync-queue';

type WhoopSyncWorkerDeps = {
  prisma?: PrismaClient;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  now?: () => Date;
};

const resolvePayload = (metadataPayload: unknown): WhoopSyncTaskPayload | null => {
  if (!metadataPayload || typeof metadataPayload !== 'object') {
    return null;
  }

  const payload = (metadataPayload as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const userId = typeof record.userId === 'string' ? record.userId : null;
  const whoopUserId = typeof record.whoopUserId === 'string' ? record.whoopUserId : null;
  const reason = record.reason;

  if (!userId || !whoopUserId || (reason !== 'initial-link' && reason !== 'scheduled' && reason !== 'manual-retry')) {
    return null;
  }

  return {
    userId,
    whoopUserId,
    reason
  };
};

export const createWhoopSyncWorker = (deps: WhoopSyncWorkerDeps = {}) => {
  const prisma = deps.prisma ?? prismaClient;
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());

  return async (taskName: string): Promise<void> => {
    const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
    if (!metadata) {
      logger.warn?.(`[whoop-sync] No task metadata found for task ${taskName}`);
      return;
    }

    const payload = resolvePayload(metadata.payload);
    logger.info?.('[whoop-sync] Dispatching wearable sync', {
      taskName,
      queue: WHOOP_SYNC_QUEUE,
      retry: WHOOP_SYNC_RETRY_CONFIG,
      payload
    });

    await prisma.cloudTaskMetadata.update({
      where: { id: metadata.id },
      data: {
        status: 'SUCCEEDED',
        attemptCount: metadata.attemptCount + 1,
        firstAttemptAt: metadata.firstAttemptAt ?? now(),
        lastAttemptAt: now()
      }
    });
  };
};

export const whoopSyncWorker = createWhoopSyncWorker();
