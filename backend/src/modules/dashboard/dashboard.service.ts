import {
  BiomarkerSource,
  InsightStatus,
  Prisma,
  type Biomarker,
  type Insight,
  type PrismaClient,
  type WhoopIntegration
} from '@prisma/client';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { getCacheClient, type CacheClient } from '../../lib/cache';

type TrendDirection = 'UP' | 'DOWN' | 'STABLE';

type MetricKey = 'readinessScore' | 'strainScore' | 'sleepScore';

type MetricConfig = {
  key: MetricKey;
  slug: string;
  heading: string;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  description: string;
  testId: string;
};

export type DashboardTile = {
  id: string;
  heading: string;
  value: number | null;
  delta: number | null;
  direction: TrendDirection;
  description: string;
  testId: string;
};

export type DashboardEmptyStates = {
  needsBiomarkerLogs: boolean;
  needsInsight: boolean;
  needsWhoopLink: boolean;
};

export type DashboardActionItem = {
  id: string;
  title: string;
  description: string;
  ctaType: 'LOG_BIOMARKER' | 'REVIEW_INSIGHT' | 'JOIN_FEED_DISCUSSION';
  testId?: string;
};

export type InsightSummary = {
  id: string;
  userId: string;
  title: string;
  summary: string;
  body: Record<string, unknown> | null;
  status: InsightStatus;
  modelUsed: string | null;
  generatedAt: string;
  promptMetadata: Record<string, unknown> | null;
};

export type DashboardBiomarkerTrend = {
  biomarkerId: string;
  biomarker: {
    id: string;
    slug: string;
    name: string;
    unit: string;
    referenceLow: number | null;
    referenceHigh: number | null;
    source: BiomarkerSource;
    createdAt: string;
    updatedAt: string;
  };
  direction: TrendDirection;
  delta: number | null;
  windowDays: number;
};

type DashboardSummaryCore = {
  readinessScore: number | null;
  strainScore: number | null;
  sleepScore: number | null;
  latestWhoopSyncAt: string | null;
  todaysInsight: InsightSummary | null;
  biomarkerTrends: DashboardBiomarkerTrend[];
  actionItems: DashboardActionItem[];
  tiles: DashboardTile[];
  emptyStates: DashboardEmptyStates;
  generatedAt: string;
};

export type DashboardSummary = DashboardSummaryCore & {
  cacheState: 'HIT' | 'MISS';
};

export type DashboardOfflineSnapshot = {
  version: number;
  generatedAt: string;
  expiresAt: string;
  summary: DashboardSummary;
};

export type DashboardCacheClient = CacheClient;

export type DashboardServiceOptions = Partial<{
  cacheKeyPrefix: string;
  cacheTtlSeconds: number;
  snapshotTtlSeconds: number;
  trendWindowDays: number;
  trendEpsilon: number;
  now: () => Date;
}>;

type TrendEntry = {
  capturedAt: Date;
  value: number;
};

type TrendComputation = {
  recentAverage: number | null;
  previousAverage: number | null;
  delta: number | null;
  direction: TrendDirection;
};

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: 'readinessScore',
    slug: 'hrv',
    heading: 'Readiness',
    direction: 'HIGHER_IS_BETTER',
    description: 'HRV compared to your baseline (higher is better).',
    testId: 'bh-dashboard-readiness'
  },
  {
    key: 'strainScore',
    slug: 'resting-heart-rate',
    heading: 'Strain',
    direction: 'LOWER_IS_BETTER',
    description: 'Resting heart rate relative to your target range.',
    testId: 'bh-dashboard-strain'
  },
  {
    key: 'sleepScore',
    slug: 'sleep-performance',
    heading: 'Sleep',
    direction: 'HIGHER_IS_BETTER',
    description: 'Sleep performance trend from wearable or manual logs.',
    testId: 'bh-dashboard-sleep'
  }
];

const sanitizeJson = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const decimalToNumber = (value: Prisma.Decimal | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  return Number(value);
};

export class DashboardService {
  private readonly cacheKeyPrefix: string;
  private readonly cacheTtlSeconds: number;
  private readonly snapshotTtlSeconds: number;
  private readonly trendWindowDays: number;
  private readonly trendEpsilon: number;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: DashboardCacheClient,
    options: DashboardServiceOptions = {}
  ) {
    this.cacheKeyPrefix = options.cacheKeyPrefix ?? 'dashboard';
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? env.DASHBOARD_CACHE_TTL_SECONDS;
    this.snapshotTtlSeconds = options.snapshotTtlSeconds ?? env.DASHBOARD_SNAPSHOT_TTL_SECONDS;
    this.trendWindowDays = options.trendWindowDays ?? 7;
    this.trendEpsilon = options.trendEpsilon ?? 0.5;
    this.now = options.now ?? (() => new Date());
  }

  async getSummary(userId: string): Promise<DashboardSummary> {
    const cacheKey = this.cacheKey(userId);
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as DashboardSummaryCore;
        return { ...parsed, cacheState: 'HIT' } satisfies DashboardSummary;
      }
    } catch (error) {
      console.warn('[dashboard] Failed to read cache', error);
    }

    const computed = await this.computeSummary(userId);

    try {
      await this.cache.set(cacheKey, JSON.stringify(computed), this.cacheTtlSeconds);
    } catch (error) {
      console.warn('[dashboard] Failed to write cache', error);
    }

    return { ...computed, cacheState: 'MISS' } satisfies DashboardSummary;
  }

  async getOfflineSnapshot(userId: string): Promise<DashboardOfflineSnapshot> {
    const summary = await this.getSummary(userId);
    const generatedAt = summary.generatedAt;
    const generatedTs = Date.parse(generatedAt);
    const expiresAt = new Date(generatedTs + this.snapshotTtlSeconds * 1000).toISOString();

    return {
      version: 1,
      generatedAt,
      expiresAt,
      summary
    } satisfies DashboardOfflineSnapshot;
  }

  async invalidateUser(userId: string): Promise<void> {
    try {
      await this.cache.del(this.cacheKey(userId));
    } catch (error) {
      console.warn('[dashboard] Failed to invalidate cache', error);
    }
  }

  private cacheKey(userId: string): string {
    return `${this.cacheKeyPrefix}:${userId}`;
  }

  private async computeSummary(userId: string): Promise<DashboardSummaryCore> {
    const now = this.now();
    const recentWindowStart = new Date(now.getTime() - this.trendWindowDays * 24 * 60 * 60 * 1000);
    const lookbackStart = new Date(now.getTime() - this.trendWindowDays * 2 * 24 * 60 * 60 * 1000);

    const biomarkerSlugs = METRIC_CONFIGS.map((metric) => metric.slug);

    const [biomarkerDefinitions, biomarkerLogs, latestInsight, whoopIntegration] = await Promise.all([
      this.prisma.biomarker.findMany({
        where: {
          slug: {
            in: biomarkerSlugs
          }
        }
      }),
      this.prisma.biomarkerLog.findMany({
        where: {
          userId,
          capturedAt: {
            gte: lookbackStart
          }
        },
        include: {
          biomarker: true
        },
        orderBy: {
          capturedAt: 'asc'
        }
      }),
      this.prisma.insight.findFirst({
        where: {
          userId,
          status: InsightStatus.DELIVERED
        },
        orderBy: {
          generatedAt: 'desc'
        }
      }),
      this.prisma.whoopIntegration.findUnique({
        where: { userId }
      })
    ]);

    const biomarkerBySlug = new Map<string, Biomarker>();
    const biomarkerById = new Map<string, Biomarker>();
    for (const biomarker of biomarkerDefinitions) {
      biomarkerBySlug.set(biomarker.slug, biomarker);
      biomarkerById.set(biomarker.id, biomarker);
    }

    type EntriesBucket = {
      biomarker: Biomarker;
      entries: TrendEntry[];
    };

    const entriesBySlug = new Map<string, EntriesBucket>();

    for (const log of biomarkerLogs) {
      const biomarker = log.biomarker ?? biomarkerById.get(log.biomarkerId);
      if (!biomarker) {
        continue;
      }

      const slug = biomarker.slug;
      if (!entriesBySlug.has(slug)) {
        entriesBySlug.set(slug, {
          biomarker,
          entries: []
        });
      }

      const bucket = entriesBySlug.get(slug)!;
      bucket.entries.push({
        capturedAt: log.capturedAt,
        value: decimalToNumber(log.value) ?? 0
      });
    }

    const metricsBySlug = new Map<string, TrendComputation>();
    const biomarkerTrends: DashboardBiomarkerTrend[] = [];

    for (const [slug, bucket] of entriesBySlug.entries()) {
      const trend = this.computeTrend(bucket.entries, recentWindowStart);
      metricsBySlug.set(slug, trend);

      biomarkerTrends.push({
        biomarkerId: bucket.biomarker.id,
        biomarker: this.serializeBiomarker(bucket.biomarker),
        direction: trend.direction,
        delta: trend.delta,
        windowDays: this.trendWindowDays
      });
    }

    let hasAnyBiomarkerLogs = biomarkerLogs.length > 0;

    if (!hasAnyBiomarkerLogs) {
      const historicalLog = await this.prisma.biomarkerLog.findFirst({
        where: { userId },
        select: { id: true }
      });
      hasAnyBiomarkerLogs = Boolean(historicalLog);
    }

    const tiles: DashboardTile[] = [];
    const summary: DashboardSummaryCore = {
      readinessScore: null,
      strainScore: null,
      sleepScore: null,
      latestWhoopSyncAt: whoopIntegration?.lastSyncedAt
        ? whoopIntegration.lastSyncedAt.toISOString()
        : null,
      todaysInsight: this.serializeInsight(latestInsight),
      biomarkerTrends,
      actionItems: [],
      tiles,
      emptyStates: {
        needsBiomarkerLogs: !hasAnyBiomarkerLogs,
        needsInsight: latestInsight === null,
        needsWhoopLink: this.needsWhoopLink(whoopIntegration)
      },
      generatedAt: now.toISOString()
    } satisfies DashboardSummaryCore;

    for (const metric of METRIC_CONFIGS) {
      const biomarker = biomarkerBySlug.get(metric.slug) ?? entriesBySlug.get(metric.slug)?.biomarker ?? null;
      const trend = metricsBySlug.get(metric.slug) ?? {
        recentAverage: null,
        previousAverage: null,
        delta: null,
        direction: 'STABLE' as TrendDirection
      } satisfies TrendComputation;

      const score = this.computeScore(biomarker, trend.recentAverage, metric.direction);
      summary[metric.key] = score;

      tiles.push({
        id: metric.key,
        heading: metric.heading,
        value: score,
        delta: trend.delta,
        direction: trend.direction,
        description: metric.description,
        testId: metric.testId
      });
    }

    summary.actionItems = this.buildActionItems(summary.emptyStates);

    return summary;
  }

  private computeTrend(entries: TrendEntry[], recentThreshold: Date): TrendComputation {
    if (entries.length === 0) {
      return {
        recentAverage: null,
        previousAverage: null,
        delta: null,
        direction: 'STABLE'
      } satisfies TrendComputation;
    }

    const sorted = [...entries].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const recentValues: number[] = [];
    const previousValues: number[] = [];

    for (const entry of sorted) {
      if (entry.capturedAt >= recentThreshold) {
        recentValues.push(entry.value);
      } else {
        previousValues.push(entry.value);
      }
    }

    const recentAverage = this.average(recentValues);
    const previousAverage = this.average(previousValues);

    let delta: number | null = null;
    let direction: TrendDirection = 'STABLE';

    if (recentAverage !== null && previousAverage !== null) {
      delta = this.roundTo(recentAverage - previousAverage, 2);
      if (delta > this.trendEpsilon) {
        direction = 'UP';
      } else if (delta < -this.trendEpsilon) {
        direction = 'DOWN';
      }
    } else if (recentAverage !== null) {
      direction = 'UP';
    }

    return {
      recentAverage,
      previousAverage,
      delta,
      direction
    } satisfies TrendComputation;
  }

  private computeScore(
    biomarker: Biomarker | null,
    recentAverage: number | null,
    direction: MetricConfig['direction']
  ): number | null {
    if (!biomarker || recentAverage === null) {
      return null;
    }

    const low = decimalToNumber(biomarker.referenceLow);
    const high = decimalToNumber(biomarker.referenceHigh);

    if (low === null || high === null || low === high) {
      return this.roundTo(Math.max(Math.min(recentAverage, 100), 0), 0);
    }

    let normalized: number;
    if (direction === 'HIGHER_IS_BETTER') {
      normalized = (recentAverage - low) / (high - low);
    } else {
      normalized = (high - recentAverage) / (high - low);
    }

    const clamped = Math.max(0, Math.min(1, normalized));
    return this.roundTo(clamped * 100, 0);
  }

  private serializeInsight(insight: Insight | null): InsightSummary | null {
    if (!insight) {
      return null;
    }

    return {
      id: insight.id,
      userId: insight.userId,
      title: insight.title,
      summary: insight.summary,
      body: sanitizeJson(insight.body),
      status: insight.status,
      modelUsed: insight.modelUsed,
      generatedAt: insight.generatedAt.toISOString(),
      promptMetadata: sanitizeJson(insight.promptMetadata)
    } satisfies InsightSummary;
  }

  private serializeBiomarker(biomarker: Biomarker): DashboardBiomarkerTrend['biomarker'] {
    return {
      id: biomarker.id,
      slug: biomarker.slug,
      name: biomarker.name,
      unit: biomarker.unit,
      referenceLow: decimalToNumber(biomarker.referenceLow),
      referenceHigh: decimalToNumber(biomarker.referenceHigh),
      source: biomarker.source,
      createdAt: biomarker.createdAt.toISOString(),
      updatedAt: biomarker.updatedAt.toISOString()
    } satisfies DashboardBiomarkerTrend['biomarker'];
  }

  private average(values: number[]): number | null {
    if (values.length === 0) {
      return null;
    }

    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length;
  }

  private roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private needsWhoopLink(integration: WhoopIntegration | null): boolean {
    if (!integration || integration.syncStatus !== 'ACTIVE') {
      return true;
    }

    return !integration.lastSyncedAt;
  }

  private buildActionItems(emptyStates: DashboardEmptyStates): DashboardActionItem[] {
    const actionItems: DashboardActionItem[] = [];

    if (emptyStates.needsBiomarkerLogs) {
      actionItems.push({
        id: 'log-biomarker',
        title: 'Log your first biomarker',
        description: 'Capture a baseline HRV reading to unlock personalized trends.',
        ctaType: 'LOG_BIOMARKER',
        testId: 'bh-dashboard-log-biomarker'
      });
    }

    if (emptyStates.needsInsight) {
      actionItems.push({
        id: 'review-insight',
        title: "Generate today's AI insight",
        description: 'Kick off an insight to get actionable guidance for the day.',
        ctaType: 'REVIEW_INSIGHT',
        testId: 'bh-insight-accept'
      });
    }

    if (!emptyStates.needsBiomarkerLogs && !emptyStates.needsInsight && !emptyStates.needsWhoopLink) {
      actionItems.push({
        id: 'community-check-in',
        title: 'Share progress with the community',
        description: 'Motivate other members with a quick update in the feed.',
        ctaType: 'JOIN_FEED_DISCUSSION',
        testId: 'bh-dashboard-community-cta'
      });
    }

    return actionItems;
  }
}

const cacheClient = getCacheClient();

export const dashboardService = new DashboardService(prismaClient, cacheClient);
