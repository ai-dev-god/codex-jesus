"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = exports.DashboardService = void 0;
const client_1 = require("@prisma/client");
const env_1 = __importDefault(require("../../config/env"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const cache_1 = require("../../lib/cache");
const METRIC_CONFIGS = [
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
const sanitizeJson = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return null;
    }
};
const decimalToNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof client_1.Prisma.Decimal) {
        return value.toNumber();
    }
    return Number(value);
};
class DashboardService {
    constructor(prisma, cache, options = {}) {
        this.prisma = prisma;
        this.cache = cache;
        this.cacheKeyPrefix = options.cacheKeyPrefix ?? 'dashboard';
        this.cacheTtlSeconds = options.cacheTtlSeconds ?? env_1.default.DASHBOARD_CACHE_TTL_SECONDS;
        this.snapshotTtlSeconds = options.snapshotTtlSeconds ?? env_1.default.DASHBOARD_SNAPSHOT_TTL_SECONDS;
        this.trendWindowDays = options.trendWindowDays ?? 7;
        this.trendEpsilon = options.trendEpsilon ?? 0.5;
        this.now = options.now ?? (() => new Date());
    }
    async getSummary(userId) {
        const cacheKey = this.cacheKey(userId);
        try {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                return { ...parsed, cacheState: 'HIT' };
            }
        }
        catch (error) {
            console.warn('[dashboard] Failed to read cache', error);
        }
        const computed = await this.computeSummary(userId);
        try {
            await this.cache.set(cacheKey, JSON.stringify(computed), this.cacheTtlSeconds);
        }
        catch (error) {
            console.warn('[dashboard] Failed to write cache', error);
        }
        return { ...computed, cacheState: 'MISS' };
    }
    async getOfflineSnapshot(userId) {
        const summary = await this.getSummary(userId);
        const generatedAt = summary.generatedAt;
        const generatedTs = Date.parse(generatedAt);
        const expiresAt = new Date(generatedTs + this.snapshotTtlSeconds * 1000).toISOString();
        return {
            version: 1,
            generatedAt,
            expiresAt,
            summary
        };
    }
    async invalidateUser(userId) {
        try {
            await this.cache.del(this.cacheKey(userId));
        }
        catch (error) {
            console.warn('[dashboard] Failed to invalidate cache', error);
        }
    }
    cacheKey(userId) {
        return `${this.cacheKeyPrefix}:${userId}`;
    }
    async computeSummary(userId) {
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
                    status: client_1.InsightStatus.DELIVERED
                },
                orderBy: {
                    generatedAt: 'desc'
                }
            }),
            this.prisma.whoopIntegration.findUnique({
                where: { userId }
            })
        ]);
        const biomarkerBySlug = new Map();
        const biomarkerById = new Map();
        for (const biomarker of biomarkerDefinitions) {
            biomarkerBySlug.set(biomarker.slug, biomarker);
            biomarkerById.set(biomarker.id, biomarker);
        }
        const entriesBySlug = new Map();
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
            const bucket = entriesBySlug.get(slug);
            bucket.entries.push({
                capturedAt: log.capturedAt,
                value: decimalToNumber(log.value) ?? 0
            });
        }
        const metricsBySlug = new Map();
        const biomarkerTrends = [];
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
        const tiles = [];
        const summary = {
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
        };
        for (const metric of METRIC_CONFIGS) {
            const biomarker = biomarkerBySlug.get(metric.slug) ?? entriesBySlug.get(metric.slug)?.biomarker ?? null;
            const trend = metricsBySlug.get(metric.slug) ?? {
                recentAverage: null,
                previousAverage: null,
                delta: null,
                direction: 'STABLE'
            };
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
    computeTrend(entries, recentThreshold) {
        if (entries.length === 0) {
            return {
                recentAverage: null,
                previousAverage: null,
                delta: null,
                direction: 'STABLE'
            };
        }
        const sorted = [...entries].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
        const recentValues = [];
        const previousValues = [];
        for (const entry of sorted) {
            if (entry.capturedAt >= recentThreshold) {
                recentValues.push(entry.value);
            }
            else {
                previousValues.push(entry.value);
            }
        }
        const recentAverage = this.average(recentValues);
        const previousAverage = this.average(previousValues);
        let delta = null;
        let direction = 'STABLE';
        if (recentAverage !== null && previousAverage !== null) {
            delta = this.roundTo(recentAverage - previousAverage, 2);
            if (delta > this.trendEpsilon) {
                direction = 'UP';
            }
            else if (delta < -this.trendEpsilon) {
                direction = 'DOWN';
            }
        }
        else if (recentAverage !== null) {
            direction = 'UP';
        }
        return {
            recentAverage,
            previousAverage,
            delta,
            direction
        };
    }
    computeScore(biomarker, recentAverage, direction) {
        if (!biomarker || recentAverage === null) {
            return null;
        }
        const low = decimalToNumber(biomarker.referenceLow);
        const high = decimalToNumber(biomarker.referenceHigh);
        if (low === null || high === null || low === high) {
            return this.roundTo(Math.max(Math.min(recentAverage, 100), 0), 0);
        }
        let normalized;
        if (direction === 'HIGHER_IS_BETTER') {
            normalized = (recentAverage - low) / (high - low);
        }
        else {
            normalized = (high - recentAverage) / (high - low);
        }
        const clamped = Math.max(0, Math.min(1, normalized));
        return this.roundTo(clamped * 100, 0);
    }
    serializeInsight(insight) {
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
        };
    }
    serializeBiomarker(biomarker) {
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
        };
    }
    average(values) {
        if (values.length === 0) {
            return null;
        }
        const sum = values.reduce((acc, value) => acc + value, 0);
        return sum / values.length;
    }
    roundTo(value, decimals) {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }
    needsWhoopLink(integration) {
        if (!integration || integration.syncStatus !== 'ACTIVE') {
            return true;
        }
        return !integration.lastSyncedAt;
    }
    buildActionItems(emptyStates) {
        const actionItems = [];
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
exports.DashboardService = DashboardService;
const cacheClient = (0, cache_1.getCacheClient)();
exports.dashboardService = new DashboardService(prisma_1.default, cacheClient);
