"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openRouterClient = exports.createOpenRouterClient = void 0;
const env_1 = __importDefault(require("../config/env"));
const http_error_1 = require("../modules/observability-ops/http-error");
const DEFAULT_RATE_LIMIT = {
    capacity: 20,
    windowMs: 60_000
};
const DEFAULT_MAX_TOKENS = 800;
const toHttpError = (status, message, details) => new http_error_1.HttpError(status, message, 'INSIGHT_PROVIDER_FAILURE', details);
const normalizeUsage = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const promptTokens = typeof payload.prompt_tokens === 'number' && Number.isFinite(payload.prompt_tokens)
        ? payload.prompt_tokens
        : undefined;
    const completionTokens = typeof payload.completion_tokens === 'number' && Number.isFinite(payload.completion_tokens)
        ? payload.completion_tokens
        : undefined;
    const totalTokens = typeof payload.total_tokens === 'number' && Number.isFinite(payload.total_tokens)
        ? payload.total_tokens
        : typeof promptTokens === 'number' && typeof completionTokens === 'number'
            ? promptTokens + completionTokens
            : undefined;
    if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
        return null;
    }
    return { promptTokens, completionTokens, totalTokens };
};
const createOpenRouterClient = (options = {}) => {
    const apiKey = options.apiKey ?? env_1.default.OPENROUTER_API_KEY ?? null;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    const now = options.now ?? (() => Date.now());
    const rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
    const maxTokensDefault = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    if (!fetchImpl) {
        throw new Error('Fetch implementation is required for OpenRouter client');
    }
    const timestamps = [];
    const assertRateLimit = () => {
        const current = now();
        while (timestamps.length > 0 && current - timestamps[0] >= rateLimit.windowMs) {
            timestamps.shift();
        }
        if (timestamps.length >= rateLimit.capacity) {
            throw new http_error_1.HttpError(429, 'Daily insight generation limit reached.', 'INSIGHT_RATE_LIMITED', { capacity: rateLimit.capacity, windowMs: rateLimit.windowMs });
        }
        timestamps.push(current);
    };
    return {
        async createChatCompletion(input) {
            if (!apiKey || apiKey.trim().length === 0) {
                throw toHttpError(503, 'OpenRouter credentials are not configured.');
            }
            assertRateLimit();
            const startedAt = now();
            const response = await fetchImpl(`${env_1.default.OPENROUTER_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: input.model,
                    messages: input.messages,
                    temperature: input.temperature,
                    max_tokens: input.maxTokens ?? maxTokensDefault
                })
            });
            const latencyMs = Math.max(0, now() - startedAt);
            if (!response.ok) {
                let errorDetails = null;
                try {
                    errorDetails = await response.json();
                }
                catch {
                    errorDetails = { status: response.status };
                }
                throw toHttpError(502, 'OpenRouter request failed.', {
                    status: response.status,
                    response: errorDetails
                });
            }
            const payload = (await response.json());
            const choice = payload?.choices?.[0]?.message?.content;
            if (!choice || typeof choice !== 'string') {
                throw toHttpError(502, 'OpenRouter returned an unexpected response format.', {
                    payload
                });
            }
            return {
                id: payload.id ?? 'openrouter-completion',
                model: payload.model ?? input.model,
                content: choice,
                usage: normalizeUsage(payload.usage ?? null),
                latencyMs
            };
        }
    };
};
exports.createOpenRouterClient = createOpenRouterClient;
exports.openRouterClient = (0, exports.createOpenRouterClient)();
