import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { Bucket, SaveOptions } from '@google-cloud/storage';

import prismaClient from '../../lib/prisma';
import { labUploadBucket } from '../../lib/storage';
import env from '../../config/env';
import { baseLogger } from '../../observability/logger';
import { labIngestionSupervisor } from './ingestion-supervisor';
import { sealLabPayload } from './lab-upload-crypto';
import { labPlanLinkService } from './plan-link.service';
import type { PanelIngestionService, PanelMeasurementInput } from '../ai/panel-ingest.service';

const bufferToText = async (buffer: Buffer, contentType?: string | null): Promise<string> => {
  if (!contentType) {
    return buffer.toString('utf8');
  }
  
  // Handle PDF files
  if (contentType.includes('pdf') || contentType === 'application/pdf') {
    try {
      // Dynamic import to handle ESM/CJS compatibility
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return result.text || '';
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Handle text-based formats
  if (contentType.includes('json') || contentType.includes('csv') || contentType.startsWith('text/')) {
    return buffer.toString('utf8');
  }
  
  // Fallback for other binary formats
  return buffer.toString('latin1');
};

type PanelIngestionAdapter = Pick<PanelIngestionService, 'applyAutomatedIngestion'>;

export type LabUploadIngestionDeps = {
  prisma?: PrismaClient;
  logger?: ReturnType<typeof baseLogger.with>;
  bucket?: Bucket;
  now?: () => Date;
  envConfig?: typeof env;
  supervisor?: typeof labIngestionSupervisor;
  panelIngestion: PanelIngestionAdapter;
  sealPayload?: typeof sealLabPayload;
  planLinkService?: typeof labPlanLinkService;
};

export type LabUploadIngestionResult = {
  measurementCount: number;
  sealedStorageKey: string;
};

const buildNormalizedPayload = (ingestion: {
  summary: string;
  notes: string[];
  measurements: PanelMeasurementInput[];
}) => ({
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
});

export const runLabUploadIngestion = async (
  uploadId: string,
  userId: string,
  deps: LabUploadIngestionDeps
): Promise<LabUploadIngestionResult> => {
  const prisma = deps.prisma ?? prismaClient;
  const logger = deps.logger ?? baseLogger.with({ component: 'lab-upload-ingestion' });
  const bucket = deps.bucket ?? labUploadBucket;
  const now = deps.now ?? (() => new Date());
  const envConfig = deps.envConfig ?? env;
  const supervisor = deps.supervisor ?? labIngestionSupervisor;
  const sealPayload = deps.sealPayload ?? sealLabPayload;
  const planLink = deps.planLinkService ?? labPlanLinkService;
  const panelIngestion = deps.panelIngestion;

  if (!panelIngestion) {
    throw new Error('panelIngestion dependency is required for lab upload ingestion.');
  }

  const upload = await prisma.panelUpload.findFirst({
    where: { id: uploadId, userId }
  });

  if (!upload) {
    throw new Error(`Upload ${uploadId} not found for user ${userId}`);
  }

  const fileHandle = bucket.file(upload.storageKey);
  const [buffer] = await fileHandle.download();
  const computedHash = createHash('sha256').update(buffer).digest('hex');

  if (upload.sha256Hash && upload.sha256Hash !== computedHash) {
    await panelIngestion.applyAutomatedIngestion(userId, uploadId, {
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

  const sealed = sealPayload(buffer);
  const sealedKey = `sealed/${upload.userId}/${upload.id}-${now().getTime()}.sealed`;
  const saveOptions: SaveOptions = {
    resumable: false,
    contentType: 'application/octet-stream',
    metadata: {
      'x-biohax-seal-iv': sealed.iv,
      'x-biohax-seal-tag': sealed.authTag,
      'x-biohax-seal-alg': sealed.algorithm
    }
  };

  if (envConfig.LAB_UPLOAD_KMS_KEY_NAME) {
    (saveOptions as SaveOptions & { kmsKeyName?: string }).kmsKeyName = envConfig.LAB_UPLOAD_KMS_KEY_NAME;
  }

  await bucket.file(sealedKey).save(sealed.ciphertext, saveOptions);

  const textPayload = await bufferToText(buffer, upload.contentType);
  const ingestion = await supervisor.supervise(textPayload, {
    rawMetadata: (upload.rawMetadata as Record<string, unknown> | null) ?? null,
    contentType: upload.contentType
  });

  const normalizedPayload = buildNormalizedPayload(ingestion);

  await panelIngestion.applyAutomatedIngestion(userId, uploadId, {
    measurements: ingestion.measurements,
    normalizedPayload,
    sealedStorageKey: sealedKey,
    sealedKeyVersion: 'lab-seal-v1',
    error: null
  });

  try {
    await planLink.autoLink(uploadId, userId, ingestion.measurements);
  } catch (error) {
    logger.warn('Lab plan auto-linking failed', {
      uploadId,
      userId,
      error: error instanceof Error ? error.message : error
    });
  }

  return {
    measurementCount: ingestion.measurements.length,
    sealedStorageKey: sealedKey
  };
};


