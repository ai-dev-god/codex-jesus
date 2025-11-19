import type { PrismaClient } from '@prisma/client';

import env from '../../config/env';
import { whoopSyncWorker } from '../../workers/whoop-sync';
import {
  enqueueWhoopSyncTask,
  type WhoopSyncEnqueueOptions,
  type WhoopSyncTaskPayload
} from './whoop-sync-queue';

type DispatchOptions = WhoopSyncEnqueueOptions & {
  swallowErrors?: boolean;
};

const shouldRunInline = env.WHOOP_SYNC_INLINE;

const logError = (message: string, context: Record<string, unknown>): void => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  console.error(message, context);
};

export const enqueueAndMaybeRunWhoopSync = async (
  prisma: PrismaClient,
  payload: WhoopSyncTaskPayload,
  options: DispatchOptions = {}
) => {
  const { swallowErrors = false, ...enqueueOptions } = options;
  const metadata = await enqueueWhoopSyncTask(prisma, payload, enqueueOptions);

  if (!shouldRunInline) {
    return metadata;
  }

  try {
    await prisma.cloudTaskMetadata.update({
      where: { id: metadata.id },
      data: {
        status: 'DISPATCHED'
      }
    });
  } catch (error) {
    logError('[whoop-sync-inline] Failed to mark task as dispatched', {
      taskName: metadata.taskName,
      error: error instanceof Error ? error.message : String(error)
    });

    if (!swallowErrors) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    return metadata;
  }

  try {
    await whoopSyncWorker(metadata.taskName);
  } catch (error) {
    logError('[whoop-sync-inline] Worker execution failed', {
      taskName: metadata.taskName,
      error: error instanceof Error ? error.message : String(error)
    });

    if (!swallowErrors) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  return metadata;
};


