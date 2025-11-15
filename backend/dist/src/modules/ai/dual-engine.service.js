"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dualEngineInsightOrchestrator = exports.DualEngineInsightOrchestrator = void 0;
const env_1 = __importDefault(require("../../config/env"));
const openrouter_1 = require("../../lib/openrouter");
const http_error_1 = require("../observability-ops/http-error");
const ENGINE_CONFIGS = [
    {
        id: 'OPENAI5',
        label: 'OpenAI 5',
        model: env_1.default.OPENROUTER_OPENAI5_MODEL
    },
    {
        id: 'GEMINI',
        label: 'Gemini 2.5 Pro',
        model: env_1.default.OPENROUTER_GEMINI25_PRO_MODEL
    }
];
const normalizeText = (value) => value.trim().toLowerCase();
const dedupeOrdered = (entries) => {
    const seen = new Set();
    const ordered = [];
    for (const entry of entries) {
        const normalized = normalizeText(entry);
        if (normalized.length === 0 || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        ordered.push(entry.trim());
    }
    return ordered;
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
const extractList = (payload, key) => {
    if (!payload.body) {
        return [];
    }
    const bucket = payload.body[key];
    if (!Array.isArray(bucket)) {
        return [];
    }
    return bucket.map((entry) => String(entry));
};
const computeAgreement = (first, second) => {
    const firstNormalized = new Set(first.map(normalizeText));
    const secondNormalized = new Set(second.map(normalizeText));
    const intersection = [...firstNormalized].filter((entry) => secondNormalized.has(entry));
    const union = new Set([...firstNormalized, ...secondNormalized]);
    return {
        intersectionCount: intersection.length,
        unionCount: union.size,
        disagreements: {
            firstOnly: first.filter((entry) => !secondNormalized.has(normalizeText(entry))),
            secondOnly: second.filter((entry) => !firstNormalized.has(normalizeText(entry)))
        }
    };
};
const buildConsensus = (executions) => {
    const [primary, secondary] = executions;
    if (!primary || !secondary) {
        throw new Error('Dual engine consensus requires two executions.');
    }
    const primaryInsights = dedupeOrdered(extractList(primary.payload, 'insights'));
    const secondaryInsights = dedupeOrdered(extractList(secondary.payload, 'insights'));
    const primaryRecommendations = dedupeOrdered(extractList(primary.payload, 'recommendations'));
    const secondaryRecommendations = dedupeOrdered(extractList(secondary.payload, 'recommendations'));
    const mergedInsights = dedupeOrdered([...primaryInsights, ...secondaryInsights]);
    const mergedRecommendations = dedupeOrdered([...primaryRecommendations, ...secondaryRecommendations]);
    const insightAgreement = computeAgreement(primaryInsights, secondaryInsights);
    const recommendationAgreement = computeAgreement(primaryRecommendations, secondaryRecommendations);
    const totalUnion = insightAgreement.unionCount + recommendationAgreement.unionCount;
    const totalIntersection = insightAgreement.intersectionCount + recommendationAgreement.intersectionCount;
    const agreementRatio = totalUnion === 0 ? 0 : totalIntersection / totalUnion;
    const confidenceScore = totalUnion === 0 ? 0.5 : Math.min(1, Math.max(0, agreementRatio));
    const titlesMatch = normalizeText(primary.payload.title) === normalizeText(secondary.payload.title);
    const summariesMatch = normalizeText(primary.payload.summary) === normalizeText(secondary.payload.summary);
    const title = titlesMatch
        ? primary.payload.title
        : `${primary.config.label}: ${primary.payload.title} | ${secondary.config.label}: ${secondary.payload.title}`;
    const summary = summariesMatch
        ? primary.payload.summary
        : `${primary.config.label}: ${primary.payload.summary}\n${secondary.config.label}: ${secondary.payload.summary}`;
    const metadata = {
        confidenceScore,
        agreementRatio,
        disagreements: {
            insights: [
                ...insightAgreement.disagreements.firstOnly.map((entry) => `${primary.config.label}: ${entry}`),
                ...insightAgreement.disagreements.secondOnly.map((entry) => `${secondary.config.label}: ${entry}`)
            ],
            recommendations: [
                ...recommendationAgreement.disagreements.firstOnly.map((entry) => `${primary.config.label}: ${entry}`),
                ...recommendationAgreement.disagreements.secondOnly.map((entry) => `${secondary.config.label}: ${entry}`)
            ]
        },
        engines: executions.map((execution) => ({
            id: execution.config.id,
            label: execution.config.label,
            model: execution.model,
            completionId: execution.completionId,
            title: execution.payload.title,
            summary: execution.payload.summary,
            insights: dedupeOrdered(extractList(execution.payload, 'insights')),
            recommendations: dedupeOrdered(extractList(execution.payload, 'recommendations'))
        }))
    };
    return {
        title,
        summary,
        body: {
            insights: mergedInsights,
            recommendations: mergedRecommendations,
            metadata
        }
    };
};
class DualEngineInsightOrchestrator {
    constructor(client = openrouter_1.openRouterClient) {
        this.client = client;
    }
    async generate(input) {
        const executions = [];
        const errors = [];
        for (const config of ENGINE_CONFIGS) {
            try {
                const completion = await this.client.createChatCompletion({
                    model: config.model,
                    messages: [
                        { role: 'system', content: input.systemPrompt },
                        { role: 'user', content: input.userPrompt }
                    ],
                    temperature: input.temperature ?? 0.2,
                    maxTokens: input.maxTokens ?? 900
                });
                const payload = parseInsightContent(completion.content);
                executions.push({
                    config,
                    completionId: completion.id,
                    model: completion.model,
                    payload
                });
            }
            catch (error) {
                errors.push({ engine: config, error });
            }
        }
        if (executions.length !== ENGINE_CONFIGS.length) {
            throw new http_error_1.HttpError(502, 'Dual-engine insight generation failed.', 'INSIGHT_DUAL_ENGINE_FAILED', errors.map((entry) => ({
                engine: entry.engine.label,
                model: entry.engine.model,
                error: entry.error instanceof Error ? entry.error.message : entry.error
            })));
        }
        return buildConsensus(executions);
    }
}
exports.DualEngineInsightOrchestrator = DualEngineInsightOrchestrator;
exports.dualEngineInsightOrchestrator = new DualEngineInsightOrchestrator();
