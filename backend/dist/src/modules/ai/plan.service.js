"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.longevityPlanService = exports.LongevityPlanService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const queue_1 = require("./queue");
const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING'];
const DEFAULT_DAILY_LIMIT = 2;
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
class LongevityPlanService {
    constructor(prisma, options = {}) {
        this.prisma = prisma;
        this.now = options.now ?? (() => new Date());
        this.dailyLimit = options.dailyLimit ?? DEFAULT_DAILY_LIMIT;
    }
    async requestPlan(userId, request) {
        await this.ensureNoActiveJob(userId);
        await this.enforceDailyLimit(userId);
        const sanitized = this.sanitizeRequest(request);
        const timestamp = this.now();
        const taskName = `longevity-plan-${userId}-${timestamp.getTime()}`;
        return this.prisma.$transaction(async (tx) => {
            const planTitle = sanitized.focusAreas.length > 0
                ? `Longevity focus: ${sanitized.focusAreas.slice(0, 2).join(', ')}`
                : 'Personalized Longevity Plan';
            const plan = await tx.longevityPlan.create({
                data: {
                    userId,
                    status: 'PROCESSING',
                    title: planTitle,
                    summary: null,
                    focusAreas: sanitized.focusAreas,
                    safetyState: client_1.Prisma.JsonNull,
                    evidence: client_1.Prisma.JsonNull,
                    sections: client_1.Prisma.JsonNull,
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
                    queue: queue_1.LONGEVITY_PLAN_QUEUE,
                    cloudTaskName: taskName,
                    payload
                }
            });
            const queuePayload = {
                jobId: job.id,
                userId,
                planId: plan.id
            };
            await (0, queue_1.enqueueLongevityPlanTask)(tx, queuePayload, {
                taskName
            });
            return { plan, job };
        });
    }
    async getPlan(userId, planId) {
        const plan = await this.prisma.longevityPlan.findFirst({
            where: {
                id: planId,
                userId
            }
        });
        if (!plan) {
            throw new http_error_1.HttpError(404, 'Plan not found.', 'PLAN_NOT_FOUND');
        }
        return plan;
    }
    async listPlans(userId, limit = 10) {
        return this.prisma.longevityPlan.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 25)
        });
    }
    sanitizeRequest(input) {
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
    uniqueStrings(values) {
        if (!values) {
            return [];
        }
        return Array.from(new Set(values
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .slice(0, 10)));
    }
    async ensureNoActiveJob(userId) {
        const existing = await this.prisma.longevityPlanJob.findFirst({
            where: {
                requestedById: userId,
                status: {
                    in: [...ACTIVE_JOB_STATUSES]
                }
            }
        });
        if (existing) {
            throw new http_error_1.HttpError(409, 'A longevity plan is already processing.', 'PLAN_JOB_IN_PROGRESS', {
                jobId: existing.id
            });
        }
    }
    async enforceDailyLimit(userId) {
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
            throw new http_error_1.HttpError(429, 'Daily longevity plan limit reached.', 'PLAN_RATE_LIMITED', { limit: this.dailyLimit });
        }
    }
}
exports.LongevityPlanService = LongevityPlanService;
exports.longevityPlanService = new LongevityPlanService(prisma_1.default);
