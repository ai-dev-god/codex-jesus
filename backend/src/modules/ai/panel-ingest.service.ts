import {
  Prisma,
  type PrismaClient,
  type PanelUpload,
  type BiomarkerMeasurement,
  type LongevityPlan,
  type PanelUploadBiomarkerTag,
  type Biomarker,
  PanelUploadSource,
  BiomarkerSource,
  MeasurementStatus
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import { labUploadBucket } from '../../lib/storage';
import env from '../../config/env';
import { baseLogger } from '../../observability/logger';
import { labUploadQueue } from '../lab-upload/ingestion-queue';

export type PanelMeasurementInput = {
  biomarkerId?: string | null;
  markerName: string;
  value?: number | null;
  unit?: string | null;
  referenceLow?: number | null;
  referenceHigh?: number | null;
  capturedAt?: Date | string | null;
  confidence?: number | null;
  flags?: Record<string, unknown> | null;
  source?: BiomarkerSource;
};

export type PanelUploadInput = {
  sessionId: string;
  storageKey: string;
  source?: PanelUploadSource;
  contentType?: string;
  pageCount?: number;
  rawMetadata?: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
  measurements?: PanelMeasurementInput[];
};

type PanelIngestionOptions = Partial<{
  now: () => Date;
}>;

const toDecimal = (value?: number | null): Prisma.Decimal | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return new Prisma.Decimal(value);
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type UploadPlanSummary = Pick<LongevityPlan, 'id' | 'title' | 'status' | 'createdAt'>;
type UploadBiomarkerSummary = Pick<Biomarker, 'id' | 'name' | 'unit'>;

type UploadWithRelations = PanelUpload & {
  measurements: BiomarkerMeasurement[];
  plan: UploadPlanSummary | null;
  biomarkerTags: Array<PanelUploadBiomarkerTag & { biomarker: UploadBiomarkerSummary }>;
};

type AutomatedIngestionInput = {
  measurements: PanelMeasurementInput[];
  normalizedPayload?: Record<string, unknown> | null;
  sealedStorageKey?: string | null;
  sealedKeyVersion?: string | null;
  error?: {
    code: string;
    message: string;
  } | null;
};

export class PanelIngestionService {
  private readonly now: () => Date;
  private readonly uploadInclude = {
    measurements: {
      orderBy: { capturedAt: 'desc' },
      take: 5
    },
    plan: {
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true
      }
    },
    biomarkerTags: {
      include: {
        biomarker: {
          select: {
            id: true,
            name: true,
            unit: true
          }
        }
      }
    }
  } as const;

  private readonly logger = baseLogger.with({ module: 'panel-ingestion-service' });

  constructor(private readonly prisma: PrismaClient, options: PanelIngestionOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async recordUpload(userId: string, input: PanelUploadInput): Promise<PanelUpload> {
    const measurements = input.measurements ?? [];
    const normalizedPayload =
      input.normalizedPayload ??
      (measurements.length > 0
        ? {
            extractedMeasurements: measurements.map((measurement) => ({
              markerName: measurement.markerName,
              biomarkerId: measurement.biomarkerId ?? null,
              value: measurement.value ?? null,
              unit: measurement.unit ?? null,
              referenceLow: measurement.referenceLow ?? null,
              referenceHigh: measurement.referenceHigh ?? null,
              capturedAt: measurement.capturedAt ?? null,
              confidence: measurement.confidence ?? null
            }))
          }
        : null);

    const status = measurements.length > 0 ? 'NORMALIZED' : 'PENDING';

    try {
      const uploadId = await this.prisma.$transaction(async (tx) => {
        const session = await tx.panelUploadSession.findFirst({
          where: {
            id: input.sessionId,
            userId
          }
        });

        if (!session) {
          throw new HttpError(404, 'Upload session not found.', 'PANEL_UPLOAD_SESSION_NOT_FOUND');
        }

        if (session.storageKey !== input.storageKey) {
          throw new HttpError(409, 'Upload session does not match storage key.', 'PANEL_UPLOAD_SESSION_MISMATCH');
        }

        const now = this.now();
        if (session.status === 'USED') {
          throw new HttpError(409, 'Upload session already used.', 'PANEL_UPLOAD_SESSION_USED');
        }

        if (session.status === 'EXPIRED' || session.expiresAt < now) {
          await tx.panelUploadSession.update({
            where: { id: session.id },
            data: { status: 'EXPIRED' }
          });
          throw new HttpError(410, 'Upload session expired.', 'PANEL_UPLOAD_SESSION_EXPIRED');
        }

        const upload = await tx.panelUpload.create({
          data: {
            userId,
            storageKey: session.storageKey,
            source: input.source ?? 'LAB_REPORT',
            status,
            contentType: session.contentType,
            byteSize: session.byteSize,
            sha256Hash: session.sha256Hash,
            pageCount: input.pageCount ?? null,
            rawMetadata: input.rawMetadata ? toJsonValue(input.rawMetadata) : Prisma.JsonNull,
            normalizedPayload: normalizedPayload ? toJsonValue(normalizedPayload) : Prisma.JsonNull,
            processedAt: measurements.length > 0 ? now : null,
            measurementCount: measurements.length,
            uploadSessionId: session.id
          }
        });

        if (measurements.length > 0) {
          await this.createMeasurements(tx, upload.id, userId, measurements);
        }

        await tx.panelUploadSession.update({
          where: { id: session.id },
          data: {
            status: 'USED',
            usedAt: now
          }
        });

        return upload.id;
      });

      const withMeasurements = await this.prisma.panelUpload.findUnique({
        where: { id: uploadId },
        include: {
          measurements: {
            orderBy: { capturedAt: 'desc' }
          }
        }
      });

      if (!withMeasurements) {
        throw new HttpError(500, 'Failed to hydrate panel upload.', 'PANEL_UPLOAD_FETCH_FAILED');
      }

      try {
        await labUploadQueue.enqueue(this.prisma, { uploadId: withMeasurements.id, userId });
      } catch (enqueueError) {
        this.logger.error('Failed to enqueue lab ingestion task', {
          uploadId: withMeasurements.id,
          userId,
          error: enqueueError instanceof Error ? enqueueError.message : enqueueError
        });
        throw new HttpError(503, 'Unable to schedule lab ingestion.', 'PANEL_UPLOAD_QUEUE_FAILED');
      }

      return withMeasurements;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async listUploads(userId: string, limit = 12): Promise<UploadWithRelations[]> {
    try {
      return await this.prisma.panelUpload.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: this.uploadInclude
      });
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  async getUpload(userId: string, uploadId: string): Promise<UploadWithRelations> {
    const upload = await this.prisma.panelUpload.findFirst({
      where: { id: uploadId, userId },
      include: this.uploadInclude
    });

    if (!upload) {
      throw new HttpError(404, 'Upload not found.', 'PANEL_UPLOAD_NOT_FOUND');
    }

    return upload;
  }

  async updateTags(
    userId: string,
    uploadId: string,
    input: { planId?: string | null; biomarkerIds?: string[] }
  ): Promise<UploadWithRelations> {
    const upload = await this.getUpload(userId, uploadId);

    await this.prisma.$transaction(async (tx) => {
      if (input.planId !== undefined) {
        if (input.planId === null) {
          await tx.panelUpload.update({
            where: { id: upload.id },
            data: { planId: null }
          });
        } else {
          const plan = await tx.longevityPlan.findFirst({
            where: { id: input.planId, userId }
          });
          if (!plan) {
            throw new HttpError(404, 'Plan not found.', 'PLAN_NOT_FOUND');
          }
          await tx.panelUpload.update({
            where: { id: upload.id },
            data: { planId: plan.id }
          });
        }
      }

      if (input.biomarkerIds) {
        await tx.panelUploadBiomarkerTag.deleteMany({
          where: { panelUploadId: upload.id }
        });

        if (input.biomarkerIds.length > 0) {
          const biomarkerRecords = await tx.biomarker.findMany({
            where: {
              id: { in: input.biomarkerIds }
            },
            select: { id: true }
          });

          if (biomarkerRecords.length !== input.biomarkerIds.length) {
            throw new HttpError(404, 'One or more biomarkers were not found.', 'BIOMARKER_NOT_FOUND');
          }

          await tx.panelUploadBiomarkerTag.createMany({
            data: biomarkerRecords.map((biomarker) => ({
              panelUploadId: upload.id,
              biomarkerId: biomarker.id
            }))
          });
        }
      }
    });

    return this.getUpload(userId, uploadId);
  }

  async resolveDownloadUrl(
    userId: string,
    uploadId: string
  ): Promise<{ url: string; expiresAt: string; token: string }> {
    const upload = await this.getUpload(userId, uploadId);
    if (!upload.storageKey) {
      throw new HttpError(400, 'Upload is missing an origin object.', 'PANEL_UPLOAD_STORAGE_MISSING');
    }

    const expiresAt = new Date(this.now().getTime() + env.LAB_UPLOAD_DOWNLOAD_TTL_SECONDS * 1000);
    const file = labUploadBucket.file(upload.storageKey);

    try {
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt
      });

      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const tokenRecord = await this.prisma.panelUploadDownloadToken.create({
        data: {
          token: tokenHash,
          userId,
          uploadId: upload.id,
          expiresAt,
          usedAt: this.now()
        }
      });

      this.logger.info('panel-upload-download-issued', {
        userId,
        uploadId: upload.id,
        downloadTokenId: tokenRecord.id,
        expiresAt: expiresAt.toISOString()
      });

      return {
        url: signedUrl,
        expiresAt: expiresAt.toISOString(),
        token: rawToken
      };
    } catch (error) {
      this.logger.error('Failed to create download URL', {
        userId,
        uploadId,
        error: error instanceof Error ? error.message : error
      });
      throw new HttpError(502, 'Unable to generate download link.', 'PANEL_DOWNLOAD_FAILED');
    }
  }

  private async createMeasurements(
    client: PrismaClient | Prisma.TransactionClient,
    uploadId: string,
    userId: string,
    measurements: PanelMeasurementInput[]
  ): Promise<void> {
    for (const measurement of measurements) {
      const capturedAt =
        typeof measurement.capturedAt === 'string'
          ? new Date(measurement.capturedAt)
          : measurement.capturedAt ?? this.now();

      await client.biomarkerMeasurement.create({
        data: {
          userId,
          biomarkerId: measurement.biomarkerId ?? null,
          panelUploadId: uploadId,
          markerName: measurement.markerName,
          value: toDecimal(measurement.value),
          unit: measurement.unit ?? null,
          referenceLow: toDecimal(measurement.referenceLow),
          referenceHigh: toDecimal(measurement.referenceHigh),
          capturedAt,
          status: MeasurementStatus.NORMALIZED,
          source: measurement.source ?? BiomarkerSource.LAB_UPLOAD,
          confidence: toDecimal(measurement.confidence),
          flags: measurement.flags ? toJsonValue(measurement.flags) : Prisma.JsonNull
        }
      });
    }
  }

  private wrapError(error: unknown): HttpError {
    if (error instanceof HttpError) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown panel ingestion failure.';
    return new HttpError(500, message, 'PANEL_INGESTION_FAILED');
  }

  async applyAutomatedIngestion(
    userId: string,
    uploadId: string,
    input: AutomatedIngestionInput
  ): Promise<UploadWithRelations> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const upload = await tx.panelUpload.findFirst({
          where: { id: uploadId, userId }
        });
        if (!upload) {
          throw new HttpError(404, 'Upload not found.', 'PANEL_UPLOAD_NOT_FOUND');
        }

        await tx.biomarkerMeasurement.deleteMany({
          where: { panelUploadId: uploadId }
        });

        if (input.measurements.length > 0) {
          await this.createMeasurements(tx, uploadId, userId, input.measurements);
        }

        const hasMeasurements = input.measurements.length > 0;
        const data: Prisma.PanelUploadUpdateInput = {
          measurementCount: input.measurements.length,
          processedAt: this.now(),
          normalizedPayload: input.normalizedPayload ? toJsonValue(input.normalizedPayload) : Prisma.JsonNull,
          sealedStorageKey: input.sealedStorageKey ?? upload.sealedStorageKey,
          sealedKeyVersion: input.sealedKeyVersion ?? upload.sealedKeyVersion
        };

        if (input.error) {
          data.status = 'FAILED';
          data.errorCode = input.error.code;
          data.errorMessage = input.error.message;
        } else if (hasMeasurements) {
          data.status = 'NORMALIZED';
          data.errorCode = null;
          data.errorMessage = null;
        } else {
          data.status = 'FAILED';
          data.errorCode = 'INGESTION_EMPTY';
          data.errorMessage = 'Ingestion completed but no biomarkers were extracted.';
        }

        await tx.panelUpload.update({
          where: { id: uploadId },
          data
        });
      });

      return this.getUpload(userId, uploadId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }
}

export const panelIngestionService = new PanelIngestionService(prismaClient);

