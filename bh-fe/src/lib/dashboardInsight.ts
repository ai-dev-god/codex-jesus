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
    engines: record.engines.map((engine) => {
      const rawLatency = (engine as { latencyMs?: unknown }).latencyMs;
      const rawCost = (engine as { costUsd?: unknown }).costUsd;
      return {
        id: engine.id,
        label: engine.label,
        model: engine.model,
        completionId: engine.completionId,
        title: engine.title,
        summary: engine.summary,
        usage: parseUsage(engine.usage),
        latencyMs: typeof rawLatency === 'number' ? rawLatency : null,
        costUsd: typeof rawCost === 'number' ? rawCost : null
      };
    })
  };
};

const parseUsage = (value: unknown): DualEngineInsightMetadata['engines'][number]['usage'] => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const promptTokens =
    typeof record.promptTokens === 'number' && Number.isFinite(record.promptTokens) ? record.promptTokens : undefined;
  const completionTokens =
    typeof record.completionTokens === 'number' && Number.isFinite(record.completionTokens)
      ? record.completionTokens
      : undefined;
  const totalTokens =
    typeof record.totalTokens === 'number' && Number.isFinite(record.totalTokens)
      ? record.totalTokens
      : typeof promptTokens === 'number' && typeof completionTokens === 'number'
        ? promptTokens + completionTokens
        : undefined;

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return null;
  }

  return { promptTokens, completionTokens, totalTokens };
};

