"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insightsService = exports.InsightGenerationService = void 0;
const env_1 = __importDefault(require("../../config/env"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const insights_queue_1 = require("./insights-queue");
const DEFAULT_DAILY_LIMIT = 3;
const DEFAULT_PIPELINE = [
    {
        id: 'openchat-5',
        model: env_1.default.OPENROUTER_OPENCHAT5_MODEL,
        temperature: 0.2,
        maxTokens: 900,
        systemPrompt: 'You are BioHax Coach, a concise wellness analyst. Focus on progressive, actionable guidance grounded in biomarker trends. ' +
            'Respond strictly in JSON with keys: title (string), summary (string), body (object with fields insights (array of strings) and recommendations (array of strings)).'
    },
    {
        id: 'gemini-2.5-pro',
        model: env_1.default.OPENROUTER_GEMINI25_PRO_MODEL,
        temperature: 0.2,
        maxTokens: 900,
        systemPrompt: 'You are BioHax Coach, crafting short wellness insights from trend summaries. Return strictly JSON with title, summary, and body { insights: string[], recommendations: string[] }.'
    }
];
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING'];
class InsightGenerationService {
    constructor(prisma, options = {}) {
        this.prisma = prisma;
        this.now = options.now ?? (() => new Date());
        this.dailyLimit = options.dailyLimit ?? DEFAULT_DAILY_LIMIT;
        this.pipeline = options.pipeline ?? DEFAULT_PIPELINE;
    }
    sanitizeRequest(input) {
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
    async ensureNoActiveJob(userId) {
        const existing = await this.prisma.insightGenerationJob.findFirst({
            where: {
                requestedById: userId,
                status: {
                    in: [...ACTIVE_JOB_STATUSES]
                }
            }
        });
        if (existing) {
            throw new http_error_1.HttpError(409, 'An insight generation job is already in progress.', 'INSIGHT_JOB_IN_PROGRESS', { jobId: existing.id });
        }
    }
    async enforceDailyLimit(userId) {
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
            throw new http_error_1.HttpError(429, 'Daily insight generation limit reached.', 'INSIGHT_RATE_LIMITED', { windowStart: windowStart.toISOString(), limit: this.dailyLimit, count });
        }
    }
    async requestGeneration(userId, request) {
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
                    queue: insights_queue_1.INSIGHTS_GENERATE_QUEUE,
                    cloudTaskName: taskName,
                    payload: payloadJson,
                    scheduledAt: null,
                    dispatchedAt: null,
                    completedAt: null,
                    errorCode: null,
                    errorMessage: null
                }
            });
            const queuePayload = {
                jobId: created.id,
                userId
            };
            await (0, insights_queue_1.enqueueInsightGenerationTask)(tx, queuePayload, {
                taskName
            });
            return created;
        });
        return job;
    }
}
exports.InsightGenerationService = InsightGenerationService;
exports.insightsService = new InsightGenerationService(prisma_1.default);
