import { Prisma, type LongevityPlan, type LongevityPlanJob, type PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import env from '../../config/env';
import { HttpError } from '../observability-ops/http-error';
import {
  enqueueLongevityPlanTask,
  LONGEVITY_PLAN_QUEUE,
  type LongevityPlanTaskPayload
} from './queue';

type LongevityPlanRequest = {
  focusAreas?: string[];
  goals?: string[];
  riskTolerance?: 'low' | 'moderate' | 'high';
  includeUploads?: string[];
  includeWearables?: boolean;
  lifestyleNotes?: string;
  retryOf?: string;
};

type SanitizedPlanRequest = {
  focusAreas: string[];
  goals: string[];
  riskTolerance: 'low' | 'moderate' | 'high';
  includeUploads: string[];
  includeWearables: boolean;
  lifestyleNotes: string | null;
  retryOf: string | null;
};

type ServiceOptions = Partial<{
  now: () => Date;
  dailyLimit: number;
}>;

type PlanRequestResult = {
  plan: LongevityPlan;
  job: LongevityPlanJob;
};

const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING'] as const;
const DEFAULT_DAILY_LIMIT = 2;

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class LongevityPlanService {
  private readonly now: () => Date;
  private readonly dailyLimit: number;

  constructor(private readonly prisma: PrismaClient, options: ServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.dailyLimit = options.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  }

  async requestPlan(userId: string, request: LongevityPlanRequest): Promise<PlanRequestResult> {
    if (!env.AI_LONGEVITY_PLAN_ENABLED) {
      throw new HttpError(
        503,
        'Longevity plan generation is temporarily disabled while we complete privacy hardening.',
        'LONGEVITY_PLAN_PAUSED'
      );
    }

    await this.ensureNoActiveJob(userId);
    await this.enforceDailyLimit(userId);

    const sanitized = this.sanitizeRequest(request);
    const timestamp = this.now();
    const taskName = `longevity-plan-${userId}-${timestamp.getTime()}`;

    return this.prisma.$transaction(async (tx) => {
      const planTitle =
        sanitized.focusAreas.length > 0
          ? `Longevity focus: ${sanitized.focusAreas.slice(0, 2).join(', ')}`
          : 'Personalized Longevity Plan';

      const plan = await tx.longevityPlan.create({
        data: {
          userId,
          status: 'PROCESSING',
          title: planTitle,
          summary: null,
          focusAreas: sanitized.focusAreas,
          safetyState: Prisma.JsonNull,
          evidence: Prisma.JsonNull,
          sections: Prisma.JsonNull,
          requestedAt: timestamp
        }
      });

      const payload = toJsonValue({
        request: sanitized,
        metrics: {
          retryCount: 0,
          createdAt: timestamp.toISOString()
        }
      });

      const job = await tx.longevityPlanJob.create({
        data: {
          planId: plan.id,
          requestedById: userId,
          status: 'QUEUED',
          queue: LONGEVITY_PLAN_QUEUE,
          cloudTaskName: taskName,
          payload
        }
      });

      const queuePayload: LongevityPlanTaskPayload = {
        jobId: job.id,
        userId,
        planId: plan.id
      };

      await enqueueLongevityPlanTask(tx as unknown as PrismaClient, queuePayload, {
        taskName
      });

      return { plan, job };
    });
  }

  async getPlan(userId: string, planId: string): Promise<LongevityPlan> {
    const plan = await this.prisma.longevityPlan.findFirst({
      where: {
        id: planId,
        userId
      }
    });

    if (!plan) {
      throw new HttpError(404, 'Plan not found.', 'PLAN_NOT_FOUND');
    }

    return plan;
  }

  async listPlans(userId: string, limit = 10): Promise<LongevityPlan[]> {
    return this.prisma.longevityPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 25)
    });
  }

  private sanitizeRequest(input: LongevityPlanRequest): SanitizedPlanRequest {
    const focusAreas = this.uniqueStrings(input.focusAreas);
    const goals = this.uniqueStrings(input.goals);
    const includeUploads = this.uniqueStrings(input.includeUploads);
    const riskTolerance = input.riskTolerance ?? 'moderate';

    return {
      focusAreas,
      goals,
      includeUploads,
      riskTolerance,
      includeWearables: input.includeWearables ?? true,
      lifestyleNotes: input.lifestyleNotes?.trim() || null,
      retryOf: input.retryOf?.trim() || null
    };
  }

  private uniqueStrings(values?: string[]): string[] {
    if (!values) {
      return [];
    }

    return Array.from(
      new Set(
        values
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .slice(0, 10)
      )
    );
  }

  private async ensureNoActiveJob(userId: string): Promise<void> {
    const existing = await this.prisma.longevityPlanJob.findFirst({
      where: {
        requestedById: userId,
        status: {
          in: [...ACTIVE_JOB_STATUSES]
        }
      }
    });

    if (existing) {
      throw new HttpError(409, 'A longevity plan is already processing.', 'PLAN_JOB_IN_PROGRESS', {
        jobId: existing.id
      });
    }
  }

  private async enforceDailyLimit(userId: string): Promise<void> {
    const since = new Date(this.now().getTime() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.longevityPlanJob.count({
      where: {
        requestedById: userId,
        createdAt: {
          gte: since
        }
      }
    });

    if (count >= this.dailyLimit) {
      throw new HttpError(
        429,
        'Daily longevity plan limit reached.',
        'PLAN_RATE_LIMITED',
        { limit: this.dailyLimit }
      );
    }
  }
}

export const longevityPlanService = new LongevityPlanService(prismaClient);
export type { LongevityPlanRequest, SanitizedPlanRequest, PlanRequestResult };

