import type { PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import env from '../../config/env';
import { baseLogger } from '../../observability/logger';
import type { PanelIngestionService } from '../ai/panel-ingest.service';
import { LAB_UPLOAD_QUEUE } from './ingestion-queue';
import { runLabUploadIngestion } from './ingestion-processor';

type PanelIngestionAdapter = Pick<PanelIngestionService, 'applyAutomatedIngestion'>;

type InlineTriggerDeps = {
  prisma?: PrismaClient;
  logger?: ReturnType<typeof baseLogger.with>;
  panelIngestion: PanelIngestionAdapter;
  now?: () => Date;
  enabled?: boolean;
};

export const maybeProcessLabUploadInline = async (
  uploadId: string,
  userId: string,
  deps: InlineTriggerDeps
): Promise<void> => {
  const enabled = deps.enabled ?? env.LAB_UPLOAD_INLINE_INGEST;
  if (!enabled) {
    return;
  }

  const prisma = deps.prisma ?? prismaClient;
  const logger =
    deps.logger ??
    baseLogger.with({
      component: 'lab-upload-inline',
      defaultFields: { worker: 'lab-upload-inline' }
    });
  const now = deps.now ?? (() => new Date());

  try {
    await runLabUploadIngestion(uploadId, userId, {
      prisma,
      logger,
      now,
      panelIngestion: deps.panelIngestion
    });
  } catch (error) {
    logger.error('Inline lab ingestion failed', {
      uploadId,
      userId,
      error: error instanceof Error ? error.message : error
    });
    return;
  }

  try {
    const metadata = await prisma.cloudTaskMetadata.findFirst({
      where: {
        queue: LAB_UPLOAD_QUEUE,
        payload: {
          path: ['payload', 'uploadId'],
          equals: uploadId
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!metadata) {
      return;
    }

    await prisma.cloudTaskMetadata.update({
      where: { id: metadata.id },
      data: {
        status: 'SUCCEEDED',
        errorMessage: null,
        attemptCount: metadata.attemptCount + 1,
        firstAttemptAt: metadata.firstAttemptAt ?? now(),
        lastAttemptAt: now()
      }
    });
  } catch (error) {
    logger.warn('Unable to mark inline ingestion task as completed', {
      uploadId,
      userId,
      error: error instanceof Error ? error.message : error
    });
  }
};


