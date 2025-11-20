import type { Biomarker, PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import type { PanelMeasurementInput } from '../ai/panel-ingest.service';
import { openRouterClient } from '../../lib/openrouter';
import env from '../../config/env';
import { baseLogger } from '../../observability/logger';
import { parseTrueAgeReport } from './parsers/trueage-parser';
import { parseGenevaGiReport } from './parsers/geneva-gi-parser';
import type { SpecializedParser } from './parsers/types';

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
  private readonly logger = baseLogger.with({ component: 'lab-ingestion-supervisor' });

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

  private async extractWithAI(text: string, biomarkerMap: Map<string, Biomarker>): Promise<CandidateMeasurement[]> {
    if (!env.OPENROUTER_API_KEY) {
      this.logger.warn('OpenRouter API key not configured, skipping AI extraction');
      return [];
    }

    try {
      // Get list of known biomarkers for context
      const biomarkerNames = Array.from(biomarkerMap.values())
        .slice(0, 50) // Limit to avoid token limits
        .map((b) => `${b.name} (${b.unit})`)
        .join(', ');

      const systemPrompt = `You are a medical lab report parser. Extract biomarker measurements from lab report text.
Return ONLY a JSON array of objects with this exact structure:
[
  {
    "markerName": "exact biomarker name from report",
    "value": numeric_value,
    "unit": "unit string or null"
  }
]
If you cannot find any measurements, return an empty array [].`;

      const userPrompt = `Extract all biomarker measurements from this lab report text. Known biomarkers include: ${biomarkerNames}

Lab report text:
${text.substring(0, 8000)}${text.length > 8000 ? '\n[...truncated]' : ''}

Return JSON array only, no other text.`;

      const completion = await openRouterClient.createChatCompletion({
        model: env.OPENROUTER_GEMINI25_PRO_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        maxTokens: 2000
      });

      // Parse JSON response
      const jsonMatch = completion.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('AI extraction did not return valid JSON array');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        markerName: string;
        value: number;
        unit: string | null;
      }>;

      return parsed.map((item) => ({
        markerName: item.markerName,
        value: item.value,
        unit: item.unit,
        line: `${item.markerName}: ${item.value} ${item.unit || ''}`
      }));
    } catch (error) {
      this.logger.warn('AI extraction failed, falling back to regex', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  async supervise(text: string, options: ExtractionOptions = {}): Promise<IngestionResult> {
    const biomarkerMap = await this.loadBiomarkerIndex();

    const specializedParsers: SpecializedParser[] = [parseTrueAgeReport, parseGenevaGiReport];
    for (const parser of specializedParsers) {
      const result = parser(text, biomarkerMap, options);
      if (result.matched && result.measurements.length > 0) {
        return {
          measurements: result.measurements,
          summary: result.summary,
          notes: result.notes
        };
      }
    }

    const notes: string[] = [];
    const measurements: PanelMeasurementInput[] = [];

    const capturedAt =
      typeof options.rawMetadata?.capturedAt === 'string' ? options.rawMetadata?.capturedAt : undefined;

    // First try regex-based extraction
    const candidates = this.detectCandidates(text);

    // If regex extraction found few or no results, try AI extraction
    if (candidates.length < 5 && text.length > 100) {
      this.logger.info('Regex extraction found few results, attempting AI extraction');
      const aiCandidates = await this.extractWithAI(text, biomarkerMap);
      if (aiCandidates.length > 0) {
        // Merge AI candidates with regex candidates, avoiding duplicates
        const existingNames = new Set(candidates.map((c) => normalizeName(c.markerName)));
        for (const aiCandidate of aiCandidates) {
          if (!existingNames.has(normalizeName(aiCandidate.markerName))) {
            candidates.push(aiCandidate);
            notes.push(`AI-extracted: ${aiCandidate.markerName}`);
          }
        }
      }
    }

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
          ? 'PDF text extraction completed but no biomarker measurements were found. The PDF may be image-based or use an unsupported format.'
          : 'No biomarker-like lines detected.'
      );
    }

    const extractionMethod = candidates.length > 0 && notes.some((n) => n.startsWith('AI-extracted:')) ? 'AI-enhanced parsing' : 'heuristic parsing';

    return {
      measurements,
      summary: `Extracted ${measurements.length} biomarker${
        measurements.length === 1 ? '' : 's'
      } via ${extractionMethod}.`,
      notes
    };
  }
}

export const labIngestionSupervisor = new LabIngestionSupervisor();

