import type { PanelUpload, PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';

import prismaClient from '../../lib/prisma';

type ReportMeasurement = {
  markerName: string;
  unit: string | null;
  value: number | null;
  previousValue: number | null;
  previousCapturedAt: string | null;
  deltaPercentage: number | null;
};

export type LabReportPayload = {
  upload: {
    id: string;
    createdAt: string;
    storageKey: string;
    fileName: string | null;
  };
  plan: {
    id: string;
    title: string | null;
    focusAreas: string[];
  } | null;
  measurements: ReportMeasurement[];
  bestPractices: string[];
  generatedAt: string;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export class LabReportService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  async buildReport(userId: string, uploadId: string): Promise<LabReportPayload> {
    const upload = await this.prisma.panelUpload.findFirst({
      where: { id: uploadId, userId },
      include: {
        plan: {
          select: { id: true, title: true, focusAreas: true }
        },
        measurements: {
          orderBy: { markerName: 'asc' }
        }
      }
    });

    if (!upload) {
      throw new Error('Upload not found');
    }

    const measurementNames = upload.measurements.map((item) => item.markerName);
    const previousMeasurements = await this.prisma.biomarkerMeasurement.findMany({
      where: {
        userId,
        markerName: { in: measurementNames },
        panelUploadId: { not: uploadId }
      },
      orderBy: { capturedAt: 'desc' }
    });

    const previousByMarker = new Map<string, typeof previousMeasurements[number]>();
    previousMeasurements.forEach((measurement) => {
      const key = measurement.markerName.toLowerCase();
      if (!previousByMarker.has(key)) {
        previousByMarker.set(key, measurement);
      }
    });

    const measurements: ReportMeasurement[] = upload.measurements.map((measurement) => {
      const key = measurement.markerName.toLowerCase();
      const previous = previousByMarker.get(key);
      const currentValue = toNumber(measurement.value);
      const previousValue = previous ? toNumber(previous.value) : null;
      const delta =
        currentValue !== null && previousValue !== null && previousValue !== 0
          ? Number((((currentValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2))
          : null;

      return {
        markerName: measurement.markerName,
        unit: measurement.unit ?? null,
        value: currentValue,
        previousValue,
        previousCapturedAt: previous?.capturedAt?.toISOString() ?? null,
        deltaPercentage: delta
      };
    });

    const bestPractices = this.deriveBestPractices(measurements, upload.plan);

    return {
      upload: {
        id: upload.id,
        createdAt: upload.createdAt.toISOString(),
        storageKey: upload.storageKey,
        fileName:
          (upload.rawMetadata && typeof (upload.rawMetadata as Record<string, unknown>).fileName === 'string'
            ? ((upload.rawMetadata as Record<string, unknown>).fileName as string)
            : null) ?? upload.storageKey.split('/').pop() ?? upload.storageKey
      },
      plan: upload.plan
        ? {
            id: upload.plan.id,
            title: upload.plan.title,
            focusAreas: upload.plan.focusAreas ?? []
          }
        : null,
      measurements,
      bestPractices,
      generatedAt: new Date().toISOString()
    };
  }

  async buildCsv(report: LabReportPayload): Promise<string> {
    const header = 'Marker,Value,Unit,Previous Value,Delta (%)';
    const rows = report.measurements.map((measurement) =>
      [
        measurement.markerName,
        measurement.value ?? '',
        measurement.unit ?? '',
        measurement.previousValue ?? '',
        measurement.deltaPercentage ?? ''
      ]
        .map((cell) => `"${cell}"`)
        .join(',')
    );
    return [header, ...rows].join('\n');
  }

  async buildPdf(report: LabReportPayload): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    doc.fontSize(18).text('BioHax Lab Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Upload ID: ${report.upload.id}`);
    doc.text(`Generated: ${report.generatedAt}`);
    if (report.plan) {
      doc.text(`Linked Plan: ${report.plan.title ?? report.plan.id}`);
    }
    doc.moveDown();

    doc.fontSize(14).text('Biomarker Summary');
    doc.moveDown(0.5);
    report.measurements.forEach((measurement) => {
      doc
        .fontSize(11)
        .text(
          `${measurement.markerName}: ${measurement.value ?? '—'} ${measurement.unit ?? ''} ` +
            `(Δ ${measurement.deltaPercentage ?? 0}%)`
        );
    });

    doc.moveDown();
    doc.fontSize(14).text('Best Practices');
    doc.moveDown(0.5);
    if (report.bestPractices.length === 0) {
      doc.fontSize(11).text('No best-practice heuristics triggered yet.');
    } else {
      report.bestPractices.forEach((note, index) => {
        doc.fontSize(11).text(`${index + 1}. ${note}`);
      });
    }

    doc.end();
    return await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  private deriveBestPractices(
    measurements: ReportMeasurement[],
    plan: LabReportPayload['plan']
  ): string[] {
    const notes: string[] = [];
    const planLabel = plan?.title ?? 'current protocol';

    measurements.forEach((measurement) => {
      if (measurement.deltaPercentage === null) {
        return;
      }
      if (measurement.deltaPercentage <= -5) {
        notes.push(
          `${measurement.markerName} improved by ${Math.abs(
            measurement.deltaPercentage
          )}% since the last draw. Continue ${planLabel} and reinforce sleep + recovery blocks.`
        );
      } else if (measurement.deltaPercentage >= 5) {
        notes.push(
          `${measurement.markerName} climbed ${measurement.deltaPercentage}%. Revisit nutrition adherence inside ${planLabel} or escalate practitioner review.`
        );
      }
    });

    return notes;
  }
}

export const labReportService = new LabReportService();

