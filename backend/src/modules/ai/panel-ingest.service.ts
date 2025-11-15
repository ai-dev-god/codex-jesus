import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type PrismaClient,
  type PanelUpload,
  type BiomarkerMeasurement,
  type LongevityPlan,
  type PanelUploadBiomarkerTag,
  type Biomarker,
  type PanelUploadDownloadToken,
  PanelUploadSource,
  BiomarkerSource,
  MeasurementStatus
} from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import env from '../../config/env';

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
  idFactory: () => string;
}>;

const toDecimal = (value?: number | null): Prisma.Decimal | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return new Prisma.Decimal(value);
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;

type UploadPlanSummary = Pick<LongevityPlan, 'id' | 'title' | 'status' | 'createdAt'>;
type UploadBiomarkerSummary = Pick<Biomarker, 'id' | 'name' | 'unit'>;

type UploadWithRelations = PanelUpload & {
  measurements: BiomarkerMeasurement[];
  plan: UploadPlanSummary | null;
  biomarkerTags: Array<PanelUploadBiomarkerTag & { biomarker: UploadBiomarkerSummary }>;
};

export class PanelIngestionService {
  private readonly now: () => Date;
  private readonly idFactory: () => string;
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

  constructor(private readonly prisma: PrismaClient, options: PanelIngestionOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => randomUUID());
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
      const upload = await this.prisma.panelUpload.create({
        data: {
          userId,
          storageKey: input.storageKey,
          source: input.source ?? 'LAB_REPORT',
          status,
          contentType: input.contentType ?? null,
          pageCount: input.pageCount ?? null,
          rawMetadata: input.rawMetadata ? toJsonValue(input.rawMetadata) : Prisma.JsonNull,
          normalizedPayload: normalizedPayload ? toJsonValue(normalizedPayload) : Prisma.JsonNull,
          processedAt: measurements.length > 0 ? this.now() : null,
          measurementCount: measurements.length
        }
      });

      if (measurements.length > 0) {
        await this.createMeasurements(upload.id, userId, measurements);
      }

      const withMeasurements = await this.prisma.panelUpload.findUnique({
        where: { id: upload.id },
        include: {
          measurements: {
            orderBy: { capturedAt: 'desc' }
          }
        }
      });

      if (!withMeasurements) {
        throw new HttpError(500, 'Failed to hydrate panel upload.', 'PANEL_UPLOAD_FETCH_FAILED');
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
  ): Promise<{ url: string; expiresAt: string }> {
    const upload = await this.getUpload(userId, uploadId);

    if (!upload.storageKey) {
      throw new HttpError(400, 'Upload is missing storage metadata.', 'PANEL_UPLOAD_STORAGE_KEY_MISSING');
    }

    const token = await this.createDownloadToken(userId, upload.id);
    return {
      url: `/ai/uploads/downloads/${token.token}`,
      expiresAt: token.expiresAt.toISOString()
    };
  }

  async redeemDownloadToken(
    userId: string,
    tokenValue: string
  ): Promise<{ upload: PanelUpload; storageUrl: string }> {
    const token = await this.prisma.panelUploadDownloadToken.findUnique({
      where: { token: tokenValue },
      include: {
        upload: true
      }
    });

    if (!token) {
      throw new HttpError(404, 'Download token not found', 'PANEL_DOWNLOAD_TOKEN_INVALID');
    }

    if (token.userId !== userId) {
      throw new HttpError(403, 'Download token does not belong to this user', 'PANEL_DOWNLOAD_TOKEN_FORBIDDEN');
    }

    if (token.usedAt) {
      throw new HttpError(410, 'Download token already used', 'PANEL_DOWNLOAD_TOKEN_USED');
    }

    if (token.expiresAt.getTime() <= this.now().getTime()) {
      throw new HttpError(410, 'Download token expired', 'PANEL_DOWNLOAD_TOKEN_EXPIRED');
    }

    if (!token.upload.storageKey) {
      throw new HttpError(400, 'Upload is missing storage metadata.', 'PANEL_UPLOAD_STORAGE_KEY_MISSING');
    }

    await this.prisma.panelUploadDownloadToken.update({
      where: { id: token.id },
      data: { usedAt: this.now() }
    });

    return {
      upload: token.upload,
      storageUrl: this.buildStorageUrl(token.upload.storageKey)
    };
  }

  private async createMeasurements(
    uploadId: string,
    userId: string,
    measurements: PanelMeasurementInput[]
  ): Promise<void> {
    for (const measurement of measurements) {
      const capturedAt =
        typeof measurement.capturedAt === 'string'
          ? new Date(measurement.capturedAt)
          : measurement.capturedAt ?? this.now();

      await this.prisma.biomarkerMeasurement.create({
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

  private async createDownloadToken(userId: string, uploadId: string): Promise<PanelUploadDownloadToken> {
    const expiresAt = new Date(this.now().getTime() + DOWNLOAD_TOKEN_TTL_MS);

    return this.prisma.panelUploadDownloadToken.create({
      data: {
        id: this.idFactory(),
        token: randomUUID(),
        userId,
        uploadId,
        expiresAt
      }
    });
  }

  private buildStorageUrl(storageKey: string): string {
    const baseUrl = env.PANEL_UPLOAD_DOWNLOAD_BASE_URL.replace(/\/+$/, '');
    const normalizedKey = storageKey.replace(/^\/+/, '');
    return `${baseUrl}/${normalizedKey}`;
  }
}

export const panelIngestionService = new PanelIngestionService(prismaClient);

