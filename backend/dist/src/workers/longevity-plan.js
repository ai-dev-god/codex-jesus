"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.longevityPlanWorker = exports.createLongevityPlanWorker = void 0;
const client_1 = require("@prisma/client");
const env_1 = __importDefault(require("../config/env"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const openrouter_1 = require("../lib/openrouter");
const logger_1 = require("../observability/logger");
const PLANNER_SYSTEM_PROMPT = `You are BioHax Orchestrator, an expert longevity strategist.
You produce structured longevity plans centered on biomarkers, lifestyle, nutrition, and supplements.
Always respond with JSON using schema:
{
  "title": string,
  "summary": string,
  "focusAreas": string[],
  "sections": [
    {
      "id": string,
      "heading": string,
      "summary": string,
      "interventions": [
        {
          "id": string,
          "type": "Lifestyle" | "Nutrition" | "Supplement" | "Advanced",
          "recommendation": string,
          "rationale": string,
          "evidence_strength": "strong" | "moderate" | "weak",
          "evidence_type": "guideline" | "RCT" | "observational" | "expert_opinion",
          "guideline_alignment": "in_guidelines" | "neutral" | "not_in_major_guidelines",
          "disclaimer": string
        }
      ]
    }
  ],
  "evidence": [
    {
      "intervention": string,
      "evidence_strength": "strong" | "moderate" | "weak",
      "evidence_type": string,
      "guideline_alignment": "in_guidelines" | "neutral" | "not_in_major_guidelines",
      "notes": string
    }
  ],
  "disclaimers": string[]
}
Keep recommendations conservative for medication changes and emphasize physician consultation when high risk.`;
const SAFETY_SYSTEM_PROMPT = `You are Gemini Safety Copilot reviewing longevity recommendations.
Return JSON with shape:
{
  "blocked": boolean,
  "requiresHandoff": boolean,
  "riskFlags": string[],
  "disclaimers": string[]
}
"blocked" should be true only when the content violates policy (eg. dosing insulin).
"requiresHandoff" should be true when clinician review is advised.
Add concise risk flags referencing biomarkers/interventions where caution is needed.`;
const NUMERIC_SYSTEM_PROMPT = `You are DeepSeek Quant, a reasoning engine that evaluates biomarker changes numerically.
Given biomarker and lifestyle context, compute risk-oriented scorecard.
Respond with JSON using schema:
{
  "scorecard": [
    {
      "name": "Cardio-metabolic",
      "score": 0-100,
      "risk": "low" | "moderate" | "elevated" | "high",
      "driver": "short explanation",
      "recommendation": "numerical what-if summary"
    }
  ]
}
Scores above 70 indicate elevated risk.`;
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const decimalToNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof client_1.Prisma.Decimal) {
        return value.toNumber();
    }
    return Number(value);
};
const parseJobPayload = (job) => {
    const rawPayload = (job.payload ?? {});
    const request = (rawPayload.request ?? {});
    return {
        request: {
            focusAreas: Array.isArray(request.focusAreas)
                ? request.focusAreas.map((entry) => String(entry))
                : [],
            goals: Array.isArray(request.goals) ? request.goals.map((entry) => String(entry)) : [],
            riskTolerance: request.riskTolerance === 'low' || request.riskTolerance === 'high'
                ? request.riskTolerance
                : 'moderate',
            includeUploads: Array.isArray(request.includeUploads)
                ? request.includeUploads.map((entry) => String(entry))
                : [],
            includeWearables: request.includeWearables !== false,
            lifestyleNotes: typeof request.lifestyleNotes === 'string' ? request.lifestyleNotes : null,
            retryOf: typeof request.retryOf === 'string' ? request.retryOf : null
        },
        metrics: typeof rawPayload.metrics === 'object' ? rawPayload.metrics : {}
    };
};
const buildPlannerPrompt = (context) => {
    return [
        'Context bundle (JSON):',
        JSON.stringify(context, null, 2),
        '',
        'Prioritize interventions with evidence strength >= moderate when possible.',
        'Clearly distinguish guideline-backed vs functional/experimental approaches.',
        'Never prescribe or adjust prescription medications.',
        'When biomarkers are missing, highlight data needs instead of guessing.'
    ].join('\n');
};
const parsePlanDraft = (raw) => {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Planner response was not valid JSON: ${error.message}`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Planner response must be an object.');
    }
    const data = parsed;
    const title = typeof data.title === 'string' ? data.title.trim() : null;
    const summary = typeof data.summary === 'string' ? data.summary.trim() : null;
    const focusAreas = Array.isArray(data.focusAreas)
        ? data.focusAreas.map((entry) => String(entry))
        : [];
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const evidence = Array.isArray(data.evidence) ? data.evidence : [];
    if (!title || !summary || sections.length === 0) {
        throw new Error('Planner response missing required top-level fields.');
    }
    return {
        title,
        summary,
        focusAreas,
        sections,
        evidence,
        disclaimers: Array.isArray(data.disclaimers)
            ? data.disclaimers.map((entry) => String(entry))
            : []
    };
};
const parseSafetyReview = (raw) => {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Safety response was not valid JSON: ${error.message}`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Safety response must be an object.');
    }
    const data = parsed;
    return {
        blocked: Boolean(data.blocked),
        requiresHandoff: Boolean(data.requiresHandoff),
        riskFlags: Array.isArray(data.riskFlags)
            ? data.riskFlags.map((entry) => String(entry))
            : [],
        disclaimers: Array.isArray(data.disclaimers)
            ? data.disclaimers.map((entry) => String(entry))
            : []
    };
};
const parseRiskScorecard = (raw) => {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Numeric response was not valid JSON: ${error.message}`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Numeric response must be an object.');
    }
    const data = parsed;
    const entries = Array.isArray(data.scorecard) ? data.scorecard : [];
    const mapped = [];
    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }
        const record = entry;
        const name = typeof record.name === 'string' ? record.name : null;
        const score = typeof record.score === 'number'
            ? record.score
            : typeof record.score === 'string'
                ? Number(record.score)
                : null;
        const risk = record.risk === 'low' ||
            record.risk === 'moderate' ||
            record.risk === 'elevated' ||
            record.risk === 'high'
            ? record.risk
            : 'moderate';
        if (!name || score === null || Number.isNaN(score)) {
            continue;
        }
        mapped.push({
            name,
            score,
            risk,
            driver: typeof record.driver === 'string' ? record.driver : undefined,
            recommendation: typeof record.recommendation === 'string' ? record.recommendation : undefined
        });
    }
    return mapped;
};
const toPlannerContext = (request, measurements, logs) => {
    const measurementPayload = measurements.map((measurement) => ({
        markerName: measurement.markerName,
        biomarkerSlug: measurement.biomarker?.slug ?? null,
        value: decimalToNumber(measurement.value),
        unit: measurement.unit,
        capturedAt: measurement.capturedAt ? measurement.capturedAt.toISOString() : null,
        confidence: decimalToNumber(measurement.confidence)
    }));
    const logPayload = logs.map((log) => ({
        markerName: log.biomarker?.name ?? log.biomarkerId,
        slug: log.biomarker?.slug ?? null,
        value: decimalToNumber(log.value),
        unit: log.unit ?? log.biomarker?.unit ?? null,
        capturedAt: log.capturedAt.toISOString()
    }));
    return {
        request,
        biomarkerMeasurements: measurementPayload,
        biomarkerLogs: logPayload
    };
};
const createLongevityPlanWorker = (deps = {}) => {
    const prisma = deps.prisma ?? prisma_1.default;
    const openRouter = deps.openRouter ?? openrouter_1.openRouterClient;
    const logger = deps.logger ?? logger_1.baseLogger.with({ component: 'longevity-plan-worker' });
    const now = deps.now ?? (() => new Date());
    return async (taskName) => {
        const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
        if (!metadata) {
            logger.warn('No metadata found for longevity plan task', { taskName });
            return;
        }
        const payloadWrapper = (metadata.payload ?? {});
        const inner = (payloadWrapper.payload ?? {});
        const jobId = typeof inner.jobId === 'string' ? inner.jobId : metadata.planJobId ?? null;
        const userId = typeof inner.userId === 'string' ? inner.userId : null;
        const planId = typeof inner.planId === 'string' ? inner.planId : null;
        if (!jobId || !userId || !planId) {
            logger.error('Task payload missing identifiers', { taskName, payload: metadata.payload });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'FAILED',
                    errorMessage: 'Missing identifiers in task payload',
                    attemptCount: metadata.attemptCount + 1,
                    firstAttemptAt: metadata.firstAttemptAt ?? now(),
                    lastAttemptAt: now()
                }
            });
            return;
        }
        const [job, plan] = await Promise.all([
            prisma.longevityPlanJob.findUnique({ where: { id: jobId } }),
            prisma.longevityPlan.findUnique({ where: { id: planId } })
        ]);
        if (!job || !plan) {
            logger.error('Longevity plan job or plan not found', { jobId, planId });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'FAILED',
                    errorMessage: 'Plan or job not found',
                    attemptCount: metadata.attemptCount + 1,
                    firstAttemptAt: metadata.firstAttemptAt ?? now(),
                    lastAttemptAt: now()
                }
            });
            return;
        }
        const jobPayload = parseJobPayload(job);
        const measurements = await prisma.biomarkerMeasurement.findMany({
            where: { userId },
            include: { biomarker: true },
            orderBy: { capturedAt: 'desc' },
            take: 30
        });
        const logs = await prisma.biomarkerLog.findMany({
            where: { userId },
            include: { biomarker: true },
            orderBy: { capturedAt: 'desc' },
            take: 20
        });
        const plannerContext = toPlannerContext(jobPayload.request, measurements, logs);
        await prisma.longevityPlanJob.update({
            where: { id: job.id },
            data: {
                status: 'RUNNING',
                dispatchedAt: job.dispatchedAt ?? now()
            }
        });
        try {
            const plannerPrompt = buildPlannerPrompt(plannerContext);
            const plannerCompletion = await openRouter.createChatCompletion({
                model: env_1.default.OPENROUTER_PLANNER_MODEL,
                messages: [
                    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
                    { role: 'user', content: plannerPrompt }
                ],
                temperature: 0.2,
                maxTokens: 1800
            });
            const planDraft = parsePlanDraft(plannerCompletion.content);
            const numericPrompt = JSON.stringify({
                request: jobPayload.request,
                biomarkerSignals: plannerContext.biomarkerMeasurements,
                logs: plannerContext.biomarkerLogs
            }, null, 2);
            const numericCompletion = await openRouter.createChatCompletion({
                model: env_1.default.OPENROUTER_NUMERIC_MODEL,
                messages: [
                    { role: 'system', content: NUMERIC_SYSTEM_PROMPT },
                    { role: 'user', content: numericPrompt }
                ],
                temperature: 0,
                maxTokens: 800
            });
            const scorecard = parseRiskScorecard(numericCompletion.content);
            const safetyPrompt = JSON.stringify({
                request: jobPayload.request,
                plan: planDraft,
                scorecard
            }, null, 2);
            const safetyCompletion = await openRouter.createChatCompletion({
                model: env_1.default.OPENROUTER_SAFETY_MODEL,
                messages: [
                    { role: 'system', content: SAFETY_SYSTEM_PROMPT },
                    { role: 'user', content: safetyPrompt }
                ],
                temperature: 0,
                maxTokens: 600
            });
            const safetyReview = parseSafetyReview(safetyCompletion.content);
            const status = safetyReview.blocked ? 'FAILED' : 'READY';
            const completedAt = now();
            await prisma.longevityPlan.update({
                where: { id: plan.id },
                data: {
                    status,
                    title: planDraft.title,
                    summary: planDraft.summary,
                    focusAreas: planDraft.focusAreas.length > 0 ? planDraft.focusAreas : jobPayload.request.focusAreas,
                    sections: toJsonValue(planDraft.sections),
                    evidence: toJsonValue(planDraft.evidence),
                    safetyState: toJsonValue({
                        ...safetyReview,
                        scorecard
                    }),
                    completedAt,
                    validatedAt: safetyReview.requiresHandoff ? null : completedAt,
                    validatedBy: safetyReview.requiresHandoff ? null : 'gemini-safety',
                    errorCode: safetyReview.blocked ? 'PLAN_BLOCKED_BY_SAFETY' : null,
                    errorMessage: safetyReview.blocked ? 'Safety system blocked delivery' : null
                }
            });
            await prisma.longevityPlanJob.update({
                where: { id: job.id },
                data: {
                    status: status === 'READY' ? 'SUCCEEDED' : 'FAILED',
                    completedAt,
                    errorCode: safetyReview.blocked ? 'PLAN_BLOCKED_BY_SAFETY' : null,
                    errorMessage: safetyReview.blocked ? 'Safety system blocked delivery' : null
                }
            });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: status === 'READY' ? 'SUCCEEDED' : 'FAILED',
                    attemptCount: metadata.attemptCount + 1,
                    firstAttemptAt: metadata.firstAttemptAt ?? now(),
                    lastAttemptAt: completedAt,
                    errorMessage: safetyReview.blocked ? 'Safety system blocked delivery' : null
                }
            });
            await prisma.aiResponseAudit.createMany({
                data: [
                    {
                        planId: plan.id,
                        userId,
                        provider: 'openrouter',
                        model: plannerCompletion.model,
                        role: 'planner',
                        prompt: toJsonValue({
                            system: PLANNER_SYSTEM_PROMPT,
                            context: plannerContext
                        }),
                        response: toJsonValue(planDraft)
                    },
                    {
                        planId: plan.id,
                        userId,
                        provider: 'openrouter',
                        model: numericCompletion.model,
                        role: 'reasoning',
                        prompt: toJsonValue({
                            system: NUMERIC_SYSTEM_PROMPT,
                            context: numericPrompt
                        }),
                        response: toJsonValue(scorecard)
                    },
                    {
                        planId: plan.id,
                        userId,
                        provider: 'openrouter',
                        model: safetyCompletion.model,
                        role: 'safety',
                        prompt: toJsonValue({
                            system: SAFETY_SYSTEM_PROMPT,
                            context: safetyPrompt
                        }),
                        response: toJsonValue(safetyReview)
                    }
                ]
            });
            logger.info('Longevity plan generation completed', {
                planId: plan.id,
                blocked: safetyReview.blocked,
                requiresHandoff: safetyReview.requiresHandoff
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown plan generation failure';
            await prisma.longevityPlan.update({
                where: { id: plan.id },
                data: {
                    status: 'FAILED',
                    errorCode: 'PLAN_ORCHESTRATION_FAILED',
                    errorMessage: message
                }
            });
            await prisma.longevityPlanJob.update({
                where: { id: job.id },
                data: {
                    status: 'FAILED',
                    completedAt: now(),
                    errorCode: 'PLAN_ORCHESTRATION_FAILED',
                    errorMessage: message
                }
            });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'FAILED',
                    attemptCount: metadata.attemptCount + 1,
                    firstAttemptAt: metadata.firstAttemptAt ?? now(),
                    lastAttemptAt: now(),
                    errorMessage: message
                }
            });
            logger.error('Longevity plan generation failed', { planId: plan.id, error: message });
        }
    };
};
exports.createLongevityPlanWorker = createLongevityPlanWorker;
exports.longevityPlanWorker = (0, exports.createLongevityPlanWorker)();
