"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insightsGenerateWorker = exports.createInsightsGenerateWorker = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const dashboard_service_1 = require("../modules/dashboard/dashboard.service");
const http_error_1 = require("../modules/observability-ops/http-error");
const dual_engine_service_1 = require("../modules/ai/dual-engine.service");
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const DEFAULT_SYSTEM_PROMPT = 'You are BioHax Coach, a concise wellness analyst. Focus on progressive, actionable guidance grounded in biomarker trends. ' +
    'Respond strictly in JSON with keys: title (string), summary (string), body (object with fields insights (array of strings) and recommendations (array of strings)).';
const parseJobPayload = (job) => {
    const raw = (job.payload ?? {});
    const rawRequest = (raw.request ?? {});
    const models = Array.isArray(raw.models)
        ? raw.models
            .filter((model) => typeof model === 'object' && model !== null && 'model' in model)
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
            .filter((attempt) => typeof attempt === 'object' && attempt !== null && 'modelId' in attempt)
            .map((attempt) => ({
            modelId: typeof attempt.modelId === 'string' ? attempt.modelId : 'unknown',
            model: typeof attempt.model === 'string' ? attempt.model : 'unknown',
            status: attempt.status === 'SUCCESS' || attempt.status === 'FAILED'
                ? attempt.status
                : 'FAILED',
            responseId: typeof attempt.responseId === 'string' ? attempt.responseId : undefined,
            errorMessage: typeof attempt.errorMessage === 'string' ? attempt.errorMessage : undefined,
            completedAt: typeof attempt.completedAt === 'string' ? attempt.completedAt : new Date().toISOString()
        }))
        : [];
    const metrics = typeof raw.metrics === 'object' && raw.metrics !== null ? raw.metrics : {};
    return {
        request: {
            focus: typeof rawRequest.focus === 'string' ? rawRequest.focus : null,
            biomarkerWindowDays: typeof rawRequest.biomarkerWindowDays === 'number' ? rawRequest.biomarkerWindowDays : 7,
            includeManualLogs: typeof rawRequest.includeManualLogs === 'boolean' ? rawRequest.includeManualLogs : true,
            retryOf: typeof rawRequest.retryOf === 'string' ? rawRequest.retryOf : null
        },
        models,
        attempts,
        metrics
    };
};
const buildUserPrompt = (payload) => {
    const lines = [
        `Focus area: ${payload.request.focus ?? 'general readiness'}.`,
        `Time window: last ${payload.request.biomarkerWindowDays} day(s).`,
        `Manual logs included: ${payload.request.includeManualLogs ? 'yes' : 'no'}.`,
        'Avoid referencing personal identifiers; rely only on aggregated biomarker trends.',
        'Respond strictly in JSON with keys title, summary, and body { insights: string[], recommendations: string[] }.'
    ];
    if (payload.request.retryOf) {
        lines.push(`This request retries insight ${payload.request.retryOf}; improve clarity and note any adaptive recommendations.`);
    }
    lines.push('Provide 2 short insights and 2 actionable recommendations tailored to the focus area.');
    return lines.join('\n');
};
const createInsightsGenerateWorker = (deps = {}) => {
    const prisma = deps.prisma ?? prisma_1.default;
    const orchestrator = deps.orchestrator ?? dual_engine_service_1.dualEngineInsightOrchestrator;
    const logger = deps.logger ?? console;
    const now = deps.now ?? (() => new Date());
    return async (taskName) => {
        const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
        if (!metadata) {
            logger.warn?.(`[insights-generate] No metadata found for ${taskName}`);
            return;
        }
        const metadataPayload = metadata.payload;
        const inner = (metadataPayload?.payload ?? {});
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
        const dispatchedAt = job.dispatchedAt ?? now();
        await prisma.insightGenerationJob.update({
            where: { id: job.id },
            data: {
                status: 'RUNNING',
                dispatchedAt
            }
        });
        const systemPrompt = payload.models[0]?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
        const userPrompt = buildUserPrompt(payload);
        try {
            logger.info?.('[insights-generate] Running dual-engine orchestration', {
                jobId,
                userId
            });
            const consensus = await orchestrator.generate({
                systemPrompt,
                userPrompt,
                temperature: 0.2,
                maxTokens: 900
            });
            const attemptRecord = {
                modelId: 'dual-engine',
                model: 'dual-engine',
                status: 'SUCCESS',
                responseId: consensus.body.metadata.engines.map((engine) => engine.completionId).join(','),
                completedAt: now().toISOString()
            };
            const created = await prisma.insight.create({
                data: {
                    userId,
                    title: consensus.title,
                    summary: consensus.summary,
                    body: toJsonValue(consensus.body),
                    status: 'DELIVERED',
                    modelUsed: 'dual-engine',
                    promptMetadata: toJsonValue({
                        request: payload.request,
                        engines: consensus.body.metadata.engines
                    }),
                    generatedAt: now()
                }
            });
            try {
                await dashboard_service_1.dashboardService.invalidateUser(userId);
            }
            catch (error) {
                logger.warn?.('[insights-generate] Failed to invalidate dashboard cache', {
                    userId,
                    error
                });
            }
            const updatedPayload = {
                ...payload,
                attempts: [...payload.attempts, attemptRecord],
                metrics: {
                    ...payload.metrics,
                    retryCount: metadata.attemptCount ?? 0,
                    failoverUsed: false
                },
                consensusMetadata: consensus.body.metadata
            };
            await prisma.insightGenerationJob.update({
                where: { id: job.id },
                data: {
                    status: 'SUCCEEDED',
                    insightId: created.id,
                    completedAt: now(),
                    payload: toJsonValue(updatedPayload),
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
            logger.info?.('[insights-generate] Insight generation succeeded', {
                jobId,
                insightId: created.id,
                confidenceScore: consensus.body.metadata.confidenceScore
            });
            return;
        }
        catch (error) {
            const failureMessage = error instanceof http_error_1.HttpError
                ? error.message
                : error instanceof Error
                    ? error.message
                    : 'Dual-engine orchestration failed.';
            const attemptRecord = {
                modelId: 'dual-engine',
                model: 'dual-engine',
                status: 'FAILED',
                errorMessage: failureMessage,
                completedAt: now().toISOString()
            };
            const updatedPayload = {
                ...payload,
                attempts: [...payload.attempts, attemptRecord],
                metrics: {
                    ...payload.metrics,
                    retryCount: (metadata.attemptCount ?? 0) + 1,
                    failoverUsed: false
                }
            };
            await prisma.insightGenerationJob.update({
                where: { id: job.id },
                data: {
                    status: 'FAILED',
                    completedAt: now(),
                    errorCode: 'INSIGHT_PROVIDER_FAILURE',
                    errorMessage: failureMessage,
                    payload: toJsonValue(updatedPayload)
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
            logger.error?.('[insights-generate] Dual-engine orchestration failed', {
                jobId,
                error: failureMessage
            });
        }
    };
};
exports.createInsightsGenerateWorker = createInsightsGenerateWorker;
exports.insightsGenerateWorker = (0, exports.createInsightsGenerateWorker)();
