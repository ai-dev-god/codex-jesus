import type { CloudTaskStatus, PrismaClient } from '@prisma/client';

import prismaClient from '../lib/prisma';
import { baseLogger } from '../observability/logger';
import env from '../config/env';
import { panelIngestionService } from '../modules/ai/panel-ingest.service';
import { runLabUploadIngestion } from '../modules/lab-upload/ingestion-processor';

type WorkerDeps = {
  prisma?: PrismaClient;
  logger?: ReturnType<typeof baseLogger.with>;
  now?: () => Date;
  panelIngestion?: typeof panelIngestionService;
};

type ParsedTaskPayload = {
  uploadId: string;
  userId: string;
};

const parseTaskPayload = (payload: unknown): ParsedTaskPayload | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const uploadId = typeof record.uploadId === 'string' ? record.uploadId : null;
  const userId = typeof record.userId === 'string' ? record.userId : null;
  if (!uploadId || !userId) {
    return null;
  }
  return { uploadId, userId };
};

export const createLabUploadWorker = (deps: WorkerDeps = {}) => {
  const prisma = deps.prisma ?? prismaClient;
  const logger =
    deps.logger ??
    baseLogger.with({
      component: 'lab-upload-ingest',
      defaultFields: { worker: 'lab-upload-ingest' }
    });
  const now = deps.now ?? (() => new Date());
  const panelIngestion = deps.panelIngestion ?? panelIngestionService;

  return async (taskName: string): Promise<void> => {
    const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
    if (!metadata) {
      logger.warn('Lab upload worker received unknown task', { taskName });
      return;
    }

    const rawPayload = (metadata.payload ?? {}) as Record<string, unknown>;
    const parsed = parseTaskPayload(rawPayload.payload) ?? parseTaskPayload(rawPayload);

    if (!parsed) {
      logger.error('Lab upload worker missing payload identifiers', { taskName, payload: metadata.payload });
      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Task payload missing uploadId or userId.',
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: metadata.firstAttemptAt ?? now(),
          lastAttemptAt: now()
        }
      });
      return;
    }

    try {
      await runLabUploadIngestion(parsed.uploadId, parsed.userId, {
        prisma,
        logger,
        now,
        envConfig: env,
        panelIngestion
      });

      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'SUCCEEDED' as CloudTaskStatus,
          errorMessage: null,
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: metadata.firstAttemptAt ?? now(),
          lastAttemptAt: now()
        }
      });
      logger.info('Lab upload ingestion completed', { taskName, uploadId: parsed.uploadId });
    } catch (error) {
      logger.error('Lab upload ingestion failed', {
        taskName,
        error: error instanceof Error ? error.message : error
      });
      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: metadata.firstAttemptAt ?? now(),
          lastAttemptAt: now()
        }
      });
      throw error;
    }
  };
};

export const labUploadIngestionWorker = createLabUploadWorker();

