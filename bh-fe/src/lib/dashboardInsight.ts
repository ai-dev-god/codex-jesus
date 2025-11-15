import type { DualEngineInsightBody, DualEngineInsightMetadata } from './api/types';

export type ParsedDualEngineBody = {
  insights: string[];
  recommendations: string[];
  metadata: DualEngineInsightMetadata | null;
};

export const parseDualEngineBody = (body: DualEngineInsightBody | null): ParsedDualEngineBody => {
  if (!body) {
    return { insights: [], recommendations: [], metadata: null };
  }

  const insights = toStringArray(body.insights);
  const recommendations = toStringArray(body.recommendations);
  const metadata = normalizeDualEngineMetadata(body.metadata);

  return { insights, recommendations, metadata };
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '')))
    .filter((entry) => entry.length > 0);
};

const clamp01 = (value: unknown): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
};

const normalizeDualEngineMetadata = (metadata: unknown): DualEngineInsightMetadata | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as DualEngineInsightMetadata & {
    disagreements?: { insights?: unknown; recommendations?: unknown };
  };

  if (!Array.isArray(record.engines)) {
    return null;
  }

  if (!record.disagreements || typeof record.disagreements !== 'object') {
    return null;
  }

  return {
    confidenceScore: clamp01((record as DualEngineInsightMetadata).confidenceScore),
    agreementRatio: clamp01((record as DualEngineInsightMetadata).agreementRatio),
    disagreements: {
      insights: toStringArray(record.disagreements.insights),
      recommendations: toStringArray(record.disagreements.recommendations)
    },
    engines: record.engines.map((engine) => ({
      id: engine.id,
      label: engine.label,
      model: engine.model,
      completionId: engine.completionId,
      title: engine.title,
      summary: engine.summary
    }))
  };
};

