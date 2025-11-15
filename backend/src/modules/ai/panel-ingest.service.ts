import {
  Prisma,
  type PrismaClient,
  type PanelUpload,
  PanelUploadSource,
  BiomarkerSource,
  MeasurementStatus
} from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';

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
}>;

const toDecimal = (value?: number | null): Prisma.Decimal | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return new Prisma.Decimal(value);
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class PanelIngestionService {
  private readonly now: () => Date;

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
}

export const panelIngestionService = new PanelIngestionService(prismaClient);

