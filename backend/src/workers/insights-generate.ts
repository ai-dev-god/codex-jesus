import { Prisma } from '@prisma/client';
import type { InsightGenerationJob, PrismaClient } from '@prisma/client';

import prismaClient from '../lib/prisma';
import { openRouterClient, type OpenRouterChatClient } from '../lib/openrouter';
import { dashboardService } from '../modules/dashboard/dashboard.service';
import { HttpError } from '../modules/observability-ops/http-error';

type InsightWorkerLogger = Pick<Console, 'info' | 'warn' | 'error'>;

type WorkerDeps = {
  prisma?: PrismaClient;
  openRouter?: OpenRouterChatClient;
  logger?: InsightWorkerLogger;
  now?: () => Date;
};

type JobModelConfig = {
  id: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
};

type JobMetrics = {
  retryCount?: number;
  failoverUsed?: boolean;
  [key: string]: unknown;
};

type JobAttempt = {
  modelId: string;
  model: string;
  status: 'SUCCESS' | 'FAILED';
  responseId?: string;
  errorMessage?: string;
  completedAt: string;
};

type JobPayload = {
  request: {
    focus: string | null;
    biomarkerWindowDays: number;
    includeManualLogs: boolean;
    retryOf: string | null;
    [key: string]: unknown;
  };
  models: JobModelConfig[];
  attempts: JobAttempt[];
  metrics: JobMetrics;
  [key: string]: unknown;
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const parseJobPayload = (job: InsightGenerationJob): JobPayload => {
  const raw = (job.payload ?? {}) as Record<string, unknown>;
  const rawRequest = (raw.request ?? {}) as Record<string, unknown>;
  const models = Array.isArray(raw.models)
    ? raw.models
        .filter((model): model is JobModelConfig => typeof model === 'object' && model !== null && 'model' in model)
        .map((model) => ({
          id: typeof model.id === 'string' ? model.id : 'model',
          model: typeof model.model === 'string' ? model.model : 'unknown',
          temperature: typeof model.temperature === 'number' ? model.temperature : 0.2,
          maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : 900,
          systemPrompt: typeof model.systemPrompt === 'string' ? model.systemPrompt : undefined
        }))
    : [];

  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts
        .filter((attempt): attempt is JobAttempt => typeof attempt === 'object' && attempt !== null && 'modelId' in attempt)
        .map((attempt) => ({
          modelId: typeof attempt.modelId === 'string' ? attempt.modelId : 'unknown',
          model: typeof attempt.model === 'string' ? attempt.model : 'unknown',
          status:
            attempt.status === 'SUCCESS' || attempt.status === 'FAILED'
              ? attempt.status
              : ('FAILED' as JobAttempt['status']),
          responseId: typeof attempt.responseId === 'string' ? attempt.responseId : undefined,
          errorMessage: typeof attempt.errorMessage === 'string' ? attempt.errorMessage : undefined,
          completedAt:
            typeof attempt.completedAt === 'string' ? attempt.completedAt : new Date().toISOString()
        }))
    : [];

  const metrics = typeof raw.metrics === 'object' && raw.metrics !== null ? (raw.metrics as JobMetrics) : {};

  return {
    request: {
      focus: typeof rawRequest.focus === 'string' ? rawRequest.focus : null,
      biomarkerWindowDays:
        typeof rawRequest.biomarkerWindowDays === 'number' ? rawRequest.biomarkerWindowDays : 7,
      includeManualLogs: typeof rawRequest.includeManualLogs === 'boolean' ? rawRequest.includeManualLogs : true,
      retryOf: typeof rawRequest.retryOf === 'string' ? rawRequest.retryOf : null
    },
    models,
    attempts,
    metrics
  };
};

const buildUserPrompt = (payload: JobPayload): string => {
  const lines = [
    `Focus area: ${payload.request.focus ?? 'general readiness'}.`,
    `Time window: last ${payload.request.biomarkerWindowDays} day(s).`,
    `Manual logs included: ${payload.request.includeManualLogs ? 'yes' : 'no'}.`,
    'Avoid referencing personal identifiers; rely only on aggregated biomarker trends.',
    'Respond strictly in JSON with keys title, summary, and body { insights: string[], recommendations: string[] }.'
  ];

  if (payload.request.retryOf) {
    lines.push(
      `This request retries insight ${payload.request.retryOf}; improve clarity and note any adaptive recommendations.`
    );
  }

  lines.push('Provide 2 short insights and 2 actionable recommendations tailored to the focus area.');

  return lines.join('\n');
};

const parseInsightContent = (raw: string) => {
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
  const body = typeof record.body === 'object' && record.body !== null ? record.body : null;

  if (!title || !summary) {
    throw new Error('Insight response missing title or summary fields.');
  }

  return {
    title,
    summary,
    body
  };
};

export const createInsightsGenerateWorker = (deps: WorkerDeps = {}) => {
  const prisma = deps.prisma ?? prismaClient;
  const openRouter = deps.openRouter ?? openRouterClient;
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());

  return async (taskName: string): Promise<void> => {
    const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
    if (!metadata) {
      logger.warn?.(`[insights-generate] No metadata found for ${taskName}`);
      return;
    }

    const metadataPayload = metadata.payload as Record<string, unknown> | null;
    const inner = (metadataPayload?.payload ?? {}) as Record<string, unknown>;
    const jobId = typeof inner.jobId === 'string' ? inner.jobId : metadata.jobId ?? null;
    const userId = typeof inner.userId === 'string' ? inner.userId : null;

    if (!jobId || !userId) {
      logger.error?.('[insights-generate] Missing jobId or userId in task payload', {
        taskName,
        payload: metadata.payload
      });
      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Task payload is missing required identifiers.',
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: metadata.firstAttemptAt ?? now(),
          lastAttemptAt: now()
        }
      });
      return;
    }

    const job = await prisma.insightGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      logger.error?.('[insights-generate] Referenced job not found', { jobId, taskName });
      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'FAILED',
          errorMessage: `Job ${jobId} was not found.`,
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: metadata.firstAttemptAt ?? now(),
          lastAttemptAt: now()
        }
      });
      return;
    }

    const payload = parseJobPayload(job);
    const models = payload.models;
    const priorRetries = metadata.attemptCount ?? 0;

    if (!Array.isArray(models) || models.length === 0) {
      logger.error?.('[insights-generate] Job payload missing model pipeline', { jobId });
      await prisma.insightGenerationJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: now(),
          errorCode: 'INSIGHT_PROVIDER_FAILURE',
          errorMessage: 'Insight pipeline configuration missing models.',
          payload: toJsonValue({
            ...payload,
            attempts: payload.attempts,
            metrics: {
              ...payload.metrics,
              retryCount: metadata.attemptCount + 1,
              failoverUsed: payload.metrics?.failoverUsed ?? false
            }
          })
        }
      });
      await prisma.cloudTaskMetadata.update({
        where: { id: metadata.id },
        data: {
          status: 'FAILED',
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: metadata.firstAttemptAt ?? now(),
          lastAttemptAt: now(),
          errorMessage: 'Insight pipeline configuration missing models.'
        }
      });
      return;
    }

    const dispatchedAt = job.dispatchedAt ?? now();
    await prisma.insightGenerationJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        dispatchedAt
      }
    });

    const attempts = [...payload.attempts];
    let success = false;
    let insightId: string | null = null;
    let lastError: string | null = null;

    for (let index = 0; index < models.length; index += 1) {
      const modelConfig = models[index];
      const startedAt = now();
      const attemptRecord: JobAttempt = {
        modelId: modelConfig.id,
        model: modelConfig.model,
        status: 'FAILED',
        completedAt: startedAt.toISOString()
      };

      try {
        logger.info?.('[insights-generate] Invoking OpenRouter model', {
          jobId,
          model: modelConfig.model,
          attempt: index + 1
        });

        const completion = await openRouter.createChatCompletion({
          model: modelConfig.model,
          messages: [
            modelConfig.systemPrompt
              ? { role: 'system' as const, content: modelConfig.systemPrompt }
              : { role: 'system' as const, content: 'You are BioHax Coach producing concise insights.' },
            { role: 'user' as const, content: buildUserPrompt(payload) }
          ],
          temperature: modelConfig.temperature ?? 0.2,
          maxTokens: modelConfig.maxTokens ?? 900
        });

        const parsed = parseInsightContent(completion.content);

        const created = await prisma.insight.create({
          data: {
            userId,
            title: parsed.title,
            summary: parsed.summary,
            body: parsed.body ? toJsonValue(parsed.body) : Prisma.JsonNull,
            status: 'DRAFT',
            modelUsed: completion.model,
            promptMetadata: toJsonValue({
              request: payload.request,
              model: modelConfig,
              responseId: completion.id,
              attempt: modelConfig.id
            }),
            generatedAt: now()
          }
        });

        try {
          await dashboardService.invalidateUser(userId);
        } catch (error) {
          logger.warn?.('[insights-generate] Failed to invalidate dashboard cache', {
            userId,
            error
          });
        }

        attemptRecord.status = 'SUCCESS';
        attemptRecord.responseId = completion.id;
        attempts.push(attemptRecord);
        payload.attempts = attempts;
        const successAttemptIndex = attempts.length - 1;
        const failoverUsed = priorRetries > 0 || successAttemptIndex > 0;
        payload.metrics = {
          ...payload.metrics,
          retryCount: priorRetries,
          failoverUsed
        };

        await prisma.insightGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'SUCCEEDED',
            insightId: created.id,
            completedAt: now(),
            payload: toJsonValue(payload),
            errorCode: null,
            errorMessage: null
          }
        });

        await prisma.cloudTaskMetadata.update({
          where: { id: metadata.id },
          data: {
            status: 'SUCCEEDED',
            attemptCount: metadata.attemptCount + 1,
            firstAttemptAt: metadata.firstAttemptAt ?? dispatchedAt,
            lastAttemptAt: now(),
            errorMessage: null
          }
        });

        insightId = created.id;
        success = true;
        break;
      } catch (error) {
        const message =
          error instanceof HttpError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Unknown OpenRouter failure';
        lastError = message;
        attemptRecord.errorMessage = message;
        attempts.push(attemptRecord);
        payload.attempts = attempts;
        const failoverUsed = priorRetries > 0 || attempts.length > 1;
        payload.metrics = {
          ...payload.metrics,
          retryCount: priorRetries,
          failoverUsed
        };

        logger.warn?.('[insights-generate] Model attempt failed', {
          jobId,
          model: modelConfig.model,
          error: message
        });

        await prisma.insightGenerationJob.update({
          where: { id: job.id },
          data: {
            payload: toJsonValue(payload)
          }
        });
      }
    }

    if (success && insightId) {
      logger.info?.('[insights-generate] Insight generation succeeded', { jobId, insightId });
      return;
    }

    payload.metrics = {
      ...payload.metrics,
      retryCount: priorRetries + 1,
      failoverUsed: priorRetries > 0 || attempts.length > 1
    };

    const failureMessage = lastError ? `All insight models failed. Last error: ${lastError}` : 'All insight models failed.';

    await prisma.insightGenerationJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        completedAt: now(),
        errorCode: 'INSIGHT_PROVIDER_FAILURE',
        errorMessage: failureMessage,
        payload: toJsonValue(payload)
      }
    });

    await prisma.cloudTaskMetadata.update({
      where: { id: metadata.id },
      data: {
        status: 'FAILED',
        attemptCount: metadata.attemptCount + 1,
        firstAttemptAt: metadata.firstAttemptAt ?? dispatchedAt,
        lastAttemptAt: now(),
        errorMessage: failureMessage
      }
    });

    logger.error?.('[insights-generate] All insight models failed', {
      jobId,
      attempts,
      error: lastError
    });
  };
};

export const insightsGenerateWorker = createInsightsGenerateWorker();
export type { OpenRouterChatClient };
