import { createHash } from 'crypto';

import type { PrismaClient } from '@prisma/client';

import prismaClient from '../lib/prisma';
import { baseLogger } from '../observability/logger';
import { labUploadBucket } from '../lib/storage';
import env from '../config/env';
import { panelIngestionService } from '../modules/ai/panel-ingest.service';
import { labIngestionSupervisor } from '../modules/lab-upload/ingestion-supervisor';
import { sealLabPayload } from '../modules/lab-upload/lab-upload-crypto';
import { labPlanLinkService } from '../modules/lab-upload/plan-link.service';

type WorkerDeps = {
  prisma?: PrismaClient;
  logger?: ReturnType<typeof baseLogger.with>;
  now?: () => Date;
};

type ParsedTaskPayload = {
  uploadId: string;
  userId: string;
};

const bufferToText = (buffer: Buffer, contentType?: string | null): string => {
  if (!contentType) {
    return buffer.toString('utf8');
  }
  if (contentType.includes('json') || contentType.includes('csv') || contentType.startsWith('text/')) {
    return buffer.toString('utf8');
  }
  return buffer.toString('latin1');
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
  const logger = deps.logger ?? baseLogger.with({ worker: 'lab-upload-ingest' });
  const now = deps.now ?? (() => new Date());

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
      const upload = await prisma.panelUpload.findFirst({
        where: { id: parsed.uploadId, userId: parsed.userId }
      });

      if (!upload) {
        throw new Error(`Upload ${parsed.uploadId} not found for user ${parsed.userId}`);
      }

      const [buffer] = await labUploadBucket.file(upload.storageKey).download();
      const computedHash = createHash('sha256').update(buffer).digest('hex');
      if (upload.sha256Hash && upload.sha256Hash !== computedHash) {
        await panelIngestionService.applyAutomatedIngestion(parsed.userId, parsed.uploadId, {
          measurements: [],
          normalizedPayload: {
            integrityFailure: true,
            expectedSha256: upload.sha256Hash,
            receivedSha256: computedHash
          },
          error: {
            code: 'INGESTION_INTEGRITY_MISMATCH',
            message: 'Uploaded file hash does not match expected value.'
          }
        });
        throw new Error('Integrity verification failed');
      }

      const sealed = sealLabPayload(buffer);
      const sealedKey = `sealed/${upload.userId}/${upload.id}-${Date.now()}.sealed`;
      await labUploadBucket.file(sealedKey).save(sealed.ciphertext, {
        resumable: false,
        contentType: 'application/octet-stream',
        metadata: {
          'x-biohax-seal-iv': sealed.iv,
          'x-biohax-seal-tag': sealed.authTag,
          'x-biohax-seal-alg': sealed.algorithm
        },
        kmsKeyName: env.LAB_UPLOAD_KMS_KEY_NAME
      });

      const textPayload = bufferToText(buffer, upload.contentType);
      const ingestion = await labIngestionSupervisor.supervise(textPayload, {
        rawMetadata: upload.rawMetadata as Record<string, unknown> | null,
        contentType: upload.contentType
      });

      const normalizedPayload = {
        source: 'AI_SUPERVISED_V1',
        ingestionSummary: ingestion.summary,
        supervisorNotes: ingestion.notes,
        extractedMeasurements: ingestion.measurements.map((measurement) => ({
          markerName: measurement.markerName,
          biomarkerId: measurement.biomarkerId ?? null,
          value: measurement.value ?? null,
          unit: measurement.unit ?? null,
          confidence: measurement.confidence ?? null,
          flags: measurement.flags ?? null
        }))
      };

      await panelIngestionService.applyAutomatedIngestion(parsed.userId, parsed.uploadId, {
        measurements: ingestion.measurements,
        normalizedPayload,
        sealedStorageKey: sealedKey,
        sealedKeyVersion: 'lab-seal-v1',
        error: null
      });

      await labPlanLinkService.autoLink(parsed.uploadId, parsed.userId, ingestion.measurements);

      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'COMPLETED',
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

