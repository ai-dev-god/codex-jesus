"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insightsGenerateWorker = exports.createInsightsGenerateWorker = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const openrouter_1 = require("../lib/openrouter");
const dashboard_service_1 = require("../modules/dashboard/dashboard.service");
const http_error_1 = require("../modules/observability-ops/http-error");
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
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
const parseInsightContent = (raw) => {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Model response was not valid JSON: ${error.message}`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Insight response must be an object.');
    }
    const record = parsed;
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
const createInsightsGenerateWorker = (deps = {}) => {
    const prisma = deps.prisma ?? prisma_1.default;
    const openRouter = deps.openRouter ?? openrouter_1.openRouterClient;
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
        let insightId = null;
        let lastError = null;
        for (let index = 0; index < models.length; index += 1) {
            const modelConfig = models[index];
            const startedAt = now();
            const attemptRecord = {
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
                            ? { role: 'system', content: modelConfig.systemPrompt }
                            : { role: 'system', content: 'You are BioHax Coach producing concise insights.' },
                        { role: 'user', content: buildUserPrompt(payload) }
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
                        body: parsed.body ? toJsonValue(parsed.body) : client_1.Prisma.JsonNull,
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
                    await dashboard_service_1.dashboardService.invalidateUser(userId);
                }
                catch (error) {
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
            }
            catch (error) {
                const message = error instanceof http_error_1.HttpError
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
exports.createInsightsGenerateWorker = createInsightsGenerateWorker;
exports.insightsGenerateWorker = (0, exports.createInsightsGenerateWorker)();
