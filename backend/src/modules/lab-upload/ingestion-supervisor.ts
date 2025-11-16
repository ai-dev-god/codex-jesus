import type { Biomarker, PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import type { PanelMeasurementInput } from '../ai/panel-ingest.service';

type ExtractionOptions = {
  rawMetadata?: Record<string, unknown> | null;
  contentType?: string | null;
};

export type IngestionResult = {
  measurements: PanelMeasurementInput[];
  summary: string;
  notes: string[];
};

type CandidateMeasurement = {
  markerName: string;
  value: number | null;
  unit: string | null;
  line: string;
};

const normalizeName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export class LabIngestionSupervisor {
  private biomarkerIndex: Map<string, Biomarker> | null = null;

  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  private async loadBiomarkerIndex(): Promise<Map<string, Biomarker>> {
    if (this.biomarkerIndex) {
      return this.biomarkerIndex;
    }

    const biomarkers = await this.prisma.biomarker.findMany({
      select: {
        id: true,
        name: true,
        unit: true,
        slug: true
      }
    });

    const index = new Map<string, Biomarker>();
    biomarkers.forEach((biomarker) => {
      index.set(normalizeName(biomarker.name), biomarker as Biomarker);
      index.set(normalizeName(biomarker.slug), biomarker as Biomarker);
    });
    this.biomarkerIndex = index;
    return index;
  }

  private detectCandidates(text: string, limit = 60): CandidateMeasurement[] {
    const lines = text.split(/\r?\n/);
    const candidates: CandidateMeasurement[] = [];
    const regex = /([A-Za-z][A-Za-z\s/%-]{2,48})[:\s]+(-?\d+(?:\.\d+)?)\s*([a-zA-Z%/]+)?/;

    for (const line of lines) {
      if (candidates.length >= limit) {
        break;
      }
      const normalizedLine = line.trim();
      if (!normalizedLine) {
        continue;
      }
      const match = normalizedLine.match(regex);
      if (!match) {
        continue;
      }
      const [, markerName, value, unit] = match;
      const parsedValue = Number.parseFloat(value);
      if (Number.isNaN(parsedValue)) {
        continue;
      }
      candidates.push({
        markerName: markerName.trim(),
        value: parsedValue,
        unit: unit ? unit.trim() : null,
        line: normalizedLine
      });
    }

    return candidates;
  }

  async supervise(text: string, options: ExtractionOptions = {}): Promise<IngestionResult> {
    const biomarkerMap = await this.loadBiomarkerIndex();
    const candidates = this.detectCandidates(text);
    const notes: string[] = [];
    const measurements: PanelMeasurementInput[] = [];

    const capturedAt =
      typeof options.rawMetadata?.capturedAt === 'string' ? options.rawMetadata?.capturedAt : undefined;

    candidates.forEach((candidate) => {
      const key = normalizeName(candidate.markerName);
      const biomarker = biomarkerMap.get(key);
      const baseConfidence = biomarker ? 0.85 : 0.65;
      const unitConfidenceBoost =
        biomarker && candidate.unit && biomarker.unit && normalizeName(candidate.unit) === normalizeName(biomarker.unit)
          ? 0.1
          : 0;
      const confidence = Math.min(1, baseConfidence + unitConfidenceBoost);

      const measurement: PanelMeasurementInput = {
        markerName: biomarker?.name ?? candidate.markerName,
        biomarkerId: biomarker?.id,
        value: candidate.value ?? undefined,
        unit: candidate.unit ?? biomarker?.unit ?? undefined,
        capturedAt,
        confidence,
        flags: {}
      };

      if (!biomarker) {
        measurement.flags = {
          ...(measurement.flags ?? {}),
          reason: 'UNMAPPED_BIOMARKER',
          rawLabel: candidate.markerName
        };
        notes.push(`Unmapped biomarker "${candidate.markerName}" detected in line "${candidate.line}".`);
      }

      if ((measurement.confidence ?? 0) < 0.7) {
        measurement.flags = {
          ...(measurement.flags ?? {}),
          lowConfidence: true
        };
        notes.push(`Low confidence extraction for "${measurement.markerName}" from "${candidate.line}".`);
      }

      measurements.push(measurement);
    });

    if (measurements.length === 0) {
      notes.push(
        options.contentType?.includes('pdf')
          ? 'OCR step produced no structured rows from PDF.'
          : 'No biomarker-like lines detected.'
      );
    }

    return {
      measurements,
      summary: `AI supervisor extracted ${measurements.length} biomarker${
        measurements.length === 1 ? '' : 's'
      } via heuristic parsing.`,
      notes
    };
  }
}

export const labIngestionSupervisor = new LabIngestionSupervisor();

