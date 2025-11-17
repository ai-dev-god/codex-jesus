import type { Prisma, PrismaClient } from '@prisma/client';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import {
  INSIGHTS_GENERATE_QUEUE,
  enqueueInsightGenerationTask,
  type InsightGenerationTaskPayload
} from './insights-queue';

type InsightGenerationRequest = {
  focus?: string;
  biomarkerWindowDays?: number;
  includeManualLogs?: boolean;
  retryOf?: string;
};

type SanitizedGenerationRequest = {
  focus: string | null;
  biomarkerWindowDays: number;
  includeManualLogs: boolean;
  retryOf: string | null;
};

type ModelConfig = {
  id: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
};

type ServiceOptions = Partial<{
  now: () => Date;
  dailyLimit: number;
  pipeline: ModelConfig[];
}>;

const DEFAULT_DAILY_LIMIT = 3;

const DEFAULT_PIPELINE: ModelConfig[] = [
  {
    id: 'openchat-5',
    model: env.OPENROUTER_OPENCHAT5_MODEL,
    temperature: 0.2,
    maxTokens: 900,
    systemPrompt:
      'You are BioHax Coach, a concise wellness analyst. Focus on progressive, actionable guidance grounded in biomarker trends. ' +
      'Respond strictly in JSON with keys: title (string), summary (string), body (object with fields insights (array of strings) and recommendations (array of strings)).'
  },
  {
    id: 'gemini-2.5-pro',
    model: env.OPENROUTER_GEMINI25_PRO_MODEL,
    temperature: 0.2,
    maxTokens: 900,
    systemPrompt:
      'You are BioHax Coach, crafting short wellness insights from trend summaries. Return strictly JSON with title, summary, and body { insights: string[], recommendations: string[] }.'
  }
];

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING'] as const;

export class InsightGenerationService {
  private readonly now: () => Date;
  private readonly dailyLimit: number;
  private readonly pipeline: ModelConfig[];

  constructor(private readonly prisma: PrismaClient, options: ServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.dailyLimit = options.dailyLimit ?? DEFAULT_DAILY_LIMIT;
    this.pipeline = options.pipeline ?? DEFAULT_PIPELINE;
  }

  private sanitizeRequest(input: InsightGenerationRequest): SanitizedGenerationRequest {
    const focus = input.focus?.trim() ?? null;
    const retryOf = input.retryOf?.trim() ?? null;
    const biomarkerWindowDays = input.biomarkerWindowDays ?? 7;
    const includeManualLogs = input.includeManualLogs ?? true;

    return {
      focus,
      biomarkerWindowDays,
      includeManualLogs,
      retryOf
    };
  }

  private async ensureNoActiveJob(userId: string): Promise<void> {
    const existing = await this.prisma.insightGenerationJob.findFirst({
      where: {
        requestedById: userId,
        status: {
          in: [...ACTIVE_JOB_STATUSES]
        }
      }
    });

    if (existing) {
      throw new HttpError(
        409,
        'An insight generation job is already in progress.',
        'INSIGHT_JOB_IN_PROGRESS',
        { jobId: existing.id }
      );
    }
  }

  private async enforceDailyLimit(userId: string): Promise<void> {
    const windowStart = new Date(this.now().getTime() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.insightGenerationJob.count({
      where: {
        requestedById: userId,
        createdAt: {
          gte: windowStart
        }
      }
    });

    if (count >= this.dailyLimit) {
      throw new HttpError(
        429,
        'Daily insight generation limit reached.',
        'INSIGHT_RATE_LIMITED',
        { windowStart: windowStart.toISOString(), limit: this.dailyLimit, count }
      );
    }
  }

  async requestGeneration(userId: string, request: InsightGenerationRequest) {
    await this.ensureNoActiveJob(userId);
    await this.enforceDailyLimit(userId);

    const sanitized = this.sanitizeRequest(request);
    const now = this.now();
    const taskName = `insights-generate-${userId}-${now.getTime()}`;

    const jobPayload = {
      request: sanitized,
      models: this.pipeline.map((model) => ({
        id: model.id,
        model: model.model,
        temperature: model.temperature,
        maxTokens: model.maxTokens,
        systemPrompt: model.systemPrompt
      })),
      attempts: [],
      metrics: {
        retryCount: 0,
        failoverUsed: false
      }
    };

    const payloadJson = toJsonValue(jobPayload);

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.insightGenerationJob.create({
        data: {
          requestedById: userId,
          status: 'QUEUED',
          queue: INSIGHTS_GENERATE_QUEUE,
          cloudTaskName: taskName,
          payload: payloadJson,
          scheduledAt: null,
          dispatchedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null
        }
      });

      const queuePayload: InsightGenerationTaskPayload = {
        jobId: created.id,
        userId
      };

      await enqueueInsightGenerationTask(tx as unknown as PrismaClient, queuePayload, {
        taskName
      });

      return created;
    });

    return job;
  }
}

export const insightsService = new InsightGenerationService(prismaClient);
export type { InsightGenerationRequest };
