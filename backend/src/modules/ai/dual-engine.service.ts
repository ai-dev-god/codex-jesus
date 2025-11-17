import env from '../../config/env';
import { openRouterClient, type OpenRouterChatClient, type ChatCompletionUsage } from '../../lib/openrouter';
import { HttpError } from '../observability-ops/http-error';

type EngineId = 'OPENAI5' | 'GEMINI';

type EngineConfig = {
  id: EngineId;
  label: string;
  model: string;
};

type InsightList = string[];

export type RawInsightPayload = {
  title: string;
  summary: string;
  body: {
    insights?: InsightList;
    recommendations?: InsightList;
    [key: string]: unknown;
  } | null;
};

type EngineExecution = {
  config: EngineConfig;
  completionId: string;
  model: string;
  payload: RawInsightPayload;
  usage: ChatCompletionUsage;
  latencyMs: number;
  costUsd: number;
};

export type InsightConsensusMetadata = {
  confidenceScore: number;
  agreementRatio: number;
  disagreements: {
    insights: InsightList;
    recommendations: InsightList;
  };
  engines: Array<{
    id: EngineId;
    label: string;
    model: string;
    completionId: string;
    title: string;
    summary: string;
    insights: InsightList;
    recommendations: InsightList;
    usage: ChatCompletionUsage;
    latencyMs: number | null;
    costUsd: number;
  }>;
};

export type DualEngineInsightResult = {
  title: string;
  summary: string;
  body: {
    insights: InsightList;
    recommendations: InsightList;
    metadata: InsightConsensusMetadata;
  };
};

export type DualEngineInsightInput = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
};

const ENGINE_CONFIGS: EngineConfig[] = [
  {
    id: 'OPENAI5',
    label: 'ChatGPT 5',
    model: env.OPENROUTER_OPENAI5_MODEL
  },
  {
    id: 'GEMINI',
    label: 'Gemini 2.5 Pro',
    model: env.OPENROUTER_GEMINI25_PRO_MODEL
  }
];

const dualEngineCostConfig = env as typeof env & {
  OPENROUTER_OPENAI5_COST_PER_1K?: number;
  OPENROUTER_GEMINI25_COST_PER_1K?: number;
};

const ENGINE_COSTS: Record<EngineId, { costPer1K: number; defaultTokens: number }> = {
  OPENAI5: {
    costPer1K: dualEngineCostConfig.OPENROUTER_OPENAI5_COST_PER_1K ?? 0.018,
    defaultTokens: 900
  },
  GEMINI: {
    costPer1K: dualEngineCostConfig.OPENROUTER_GEMINI25_COST_PER_1K ?? 0.009,
    defaultTokens: 850
  }
};

const computeEngineCost = (engineId: EngineId, tokens: number): number => {
  const billing = ENGINE_COSTS[engineId];
  if (!billing || !Number.isFinite(tokens) || tokens <= 0) {
    return 0;
  }
  return (tokens / 1000) * billing.costPer1K;
};

const resolveTokenUsage = (engineId: EngineId, usage: ChatCompletionUsage): number => {
  if (usage && typeof usage.totalTokens === 'number' && Number.isFinite(usage.totalTokens)) {
    return usage.totalTokens;
  }
  return ENGINE_COSTS[engineId]?.defaultTokens ?? 800;
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const dedupeOrdered = (entries: InsightList): InsightList => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const entry of entries) {
    const normalized = normalizeText(entry);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ordered.push(entry.trim());
  }
  return ordered;
};

const parseInsightContent = (raw: string): RawInsightPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Model response was not valid JSON: ${(error as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Insight response must be an object.');
  }

  const record = parsed as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : null;
  const summary = typeof record.summary === 'string' ? record.summary.trim() : null;
  const body = typeof record.body === 'object' && record.body !== null ? (record.body as RawInsightPayload['body']) : null;

  if (!title || !summary) {
    throw new Error('Insight response missing title or summary fields.');
  }

  return {
    title,
    summary,
    body
  };
};

const extractList = (payload: RawInsightPayload, key: 'insights' | 'recommendations'): InsightList => {
  if (!payload.body) {
    return [];
  }

  const bucket = payload.body[key];
  if (!Array.isArray(bucket)) {
    return [];
  }

  return bucket.map((entry) => String(entry));
};

const computeAgreement = (first: InsightList, second: InsightList) => {
  const firstNormalized = new Set(first.map(normalizeText));
  const secondNormalized = new Set(second.map(normalizeText));
  const intersection = [...firstNormalized].filter((entry) => secondNormalized.has(entry));
  const union = new Set([...firstNormalized, ...secondNormalized]);

  return {
    intersectionCount: intersection.length,
    unionCount: union.size,
    disagreements: {
      firstOnly: first.filter((entry) => !secondNormalized.has(normalizeText(entry))),
      secondOnly: second.filter((entry) => !firstNormalized.has(normalizeText(entry)))
    }
  };
};

const buildConsensus = (executions: EngineExecution[]): DualEngineInsightResult => {
  const [primary, secondary] = executions;

  if (!primary || !secondary) {
    throw new Error('Dual engine consensus requires two executions.');
  }

  const primaryInsights = dedupeOrdered(extractList(primary.payload, 'insights'));
  const secondaryInsights = dedupeOrdered(extractList(secondary.payload, 'insights'));
  const primaryRecommendations = dedupeOrdered(extractList(primary.payload, 'recommendations'));
  const secondaryRecommendations = dedupeOrdered(extractList(secondary.payload, 'recommendations'));

  const mergedInsights = dedupeOrdered([...primaryInsights, ...secondaryInsights]);
  const mergedRecommendations = dedupeOrdered([...primaryRecommendations, ...secondaryRecommendations]);

  const insightAgreement = computeAgreement(primaryInsights, secondaryInsights);
  const recommendationAgreement = computeAgreement(primaryRecommendations, secondaryRecommendations);

  const totalUnion = insightAgreement.unionCount + recommendationAgreement.unionCount;
  const totalIntersection = insightAgreement.intersectionCount + recommendationAgreement.intersectionCount;

  const agreementRatio = totalUnion === 0 ? 0 : totalIntersection / totalUnion;
  const confidenceScore = totalUnion === 0 ? 0.5 : Math.min(1, Math.max(0, agreementRatio));

  const titlesMatch = normalizeText(primary.payload.title) === normalizeText(secondary.payload.title);
  const summariesMatch = normalizeText(primary.payload.summary) === normalizeText(secondary.payload.summary);

  const title = titlesMatch
    ? primary.payload.title
    : `${primary.config.label}: ${primary.payload.title} | ${secondary.config.label}: ${secondary.payload.title}`;

  const summary = summariesMatch
    ? primary.payload.summary
    : `${primary.config.label}: ${primary.payload.summary}\n${secondary.config.label}: ${secondary.payload.summary}`;

  const metadata: InsightConsensusMetadata = {
    confidenceScore,
    agreementRatio,
    disagreements: {
      insights: [
        ...insightAgreement.disagreements.firstOnly.map((entry) => `${primary.config.label}: ${entry}`),
        ...insightAgreement.disagreements.secondOnly.map((entry) => `${secondary.config.label}: ${entry}`)
      ],
      recommendations: [
        ...recommendationAgreement.disagreements.firstOnly.map((entry) => `${primary.config.label}: ${entry}`),
        ...recommendationAgreement.disagreements.secondOnly.map((entry) => `${secondary.config.label}: ${entry}`)
      ]
    },
    engines: executions.map((execution) => ({
      id: execution.config.id,
      label: execution.config.label,
      model: execution.model,
      completionId: execution.completionId,
      title: execution.payload.title,
      summary: execution.payload.summary,
      insights: dedupeOrdered(extractList(execution.payload, 'insights')),
      recommendations: dedupeOrdered(extractList(execution.payload, 'recommendations')),
      usage: execution.usage,
      latencyMs: Number.isFinite(execution.latencyMs) ? execution.latencyMs : null,
      costUsd: execution.costUsd
    }))
  };

  return {
    title,
    summary,
    body: {
      insights: mergedInsights,
      recommendations: mergedRecommendations,
      metadata
    }
  };
};

export class DualEngineInsightOrchestrator {
  constructor(private readonly client: OpenRouterChatClient = openRouterClient) {}

  async generate(input: DualEngineInsightInput): Promise<DualEngineInsightResult> {
    const executions: EngineExecution[] = [];
    const errors: Array<{ engine: EngineConfig; error: unknown }> = [];

    for (const config of ENGINE_CONFIGS) {
      try {
        const completion = await this.client.createChatCompletion({
          model: config.model,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt }
          ],
          temperature: input.temperature ?? 0.2,
          maxTokens: input.maxTokens ?? 900
        });

        const payload = parseInsightContent(completion.content);
        const usage = completion.usage;
        const latencyMs = completion.latencyMs ?? 0;
        const totalTokens = resolveTokenUsage(config.id, usage);
        const costUsd = computeEngineCost(config.id, totalTokens);

        executions.push({
          config,
          completionId: completion.id,
          model: completion.model,
          payload,
          usage,
          latencyMs,
          costUsd
        });
      } catch (error) {
        errors.push({ engine: config, error });
      }
    }

    if (executions.length !== ENGINE_CONFIGS.length) {
      throw new HttpError(
        502,
        'Dual-engine insight generation failed.',
        'INSIGHT_DUAL_ENGINE_FAILED',
        errors.map((entry) => ({
          engine: entry.engine.label,
          model: entry.engine.model,
          error: entry.error instanceof Error ? entry.error.message : entry.error
        }))
      );
    }

    return buildConsensus(executions);
  }
}

export const dualEngineInsightOrchestrator = new DualEngineInsightOrchestrator();

