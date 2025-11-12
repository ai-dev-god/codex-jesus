import type { Prisma, PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';

export const WHOOP_SYNC_QUEUE = 'whoop-sync';

export const WHOOP_SYNC_RETRY_CONFIG = {
  maxAttempts: 5,
  minBackoffSeconds: 60,
  maxBackoffSeconds: 600
} as const;

export type WhoopSyncReason = 'initial-link' | 'scheduled' | 'manual-retry';

export type WhoopSyncTaskPayload = {
    userId: string;
    whoopUserId: string;
    reason: WhoopSyncReason;
};

type EnqueueOptions = {
  scheduleTime?: Date;
  taskName?: string;
};

const toJsonValue = (payload: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;

export const enqueueWhoopSyncTask = async (
  prisma: PrismaClient,
  payload: WhoopSyncTaskPayload,
  options: EnqueueOptions = {}
) => {
  const taskName = options.taskName ?? `whoop-sync-${payload.userId}-${Date.now()}`;

  return prisma.cloudTaskMetadata.create({
    data: {
      taskName,
      queue: WHOOP_SYNC_QUEUE,
      payload: toJsonValue({
        payload,
        retry: WHOOP_SYNC_RETRY_CONFIG
      }),
      scheduleTime: options.scheduleTime ?? null,
      status: 'PENDING'
    }
  });
};

export const whoopSyncQueue = {
  queue: WHOOP_SYNC_QUEUE,
  retryConfig: WHOOP_SYNC_RETRY_CONFIG,
  enqueue: (payload: WhoopSyncTaskPayload, options?: EnqueueOptions) =>
    enqueueWhoopSyncTask(prismaClient, payload, options)
};
