import env from '../config/env';
import { HttpError } from '../modules/observability-ops/http-error';

type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatCompletionUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} | null;

export type ChatCompletionInput = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ChatCompletionResult = {
  id: string;
  model: string;
  content: string;
  usage: ChatCompletionUsage;
  latencyMs: number;
};

type OpenRouterUsagePayload = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
} | null;

type OpenRouterResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: OpenRouterUsagePayload;
};

type RateLimitConfig = {
  capacity: number;
  windowMs: number;
};

type CreateClientOptions = {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  rateLimit?: RateLimitConfig;
  defaultMaxTokens?: number;
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  capacity: 20,
  windowMs: 60_000
};

const DEFAULT_MAX_TOKENS = 800;

const toHttpError = (status: number, message: string, details?: unknown) =>
  new HttpError(status, message, 'INSIGHT_PROVIDER_FAILURE', details);

const normalizeUsage = (payload: OpenRouterUsagePayload): ChatCompletionUsage => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const promptTokens =
    typeof payload.prompt_tokens === 'number' && Number.isFinite(payload.prompt_tokens)
      ? payload.prompt_tokens
      : undefined;
  const completionTokens =
    typeof payload.completion_tokens === 'number' && Number.isFinite(payload.completion_tokens)
      ? payload.completion_tokens
      : undefined;
  const totalTokens =
    typeof payload.total_tokens === 'number' && Number.isFinite(payload.total_tokens)
      ? payload.total_tokens
      : typeof promptTokens === 'number' && typeof completionTokens === 'number'
        ? promptTokens + completionTokens
        : undefined;

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return null;
  }

  return { promptTokens, completionTokens, totalTokens };
};

export type OpenRouterChatClient = {
  createChatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult>;
};

export const createOpenRouterClient = (options: CreateClientOptions = {}): OpenRouterChatClient => {
  const apiKey = options.apiKey ?? env.OPENROUTER_API_KEY ?? null;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const now = options.now ?? (() => Date.now());
  const rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const maxTokensDefault = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;

  if (!fetchImpl) {
    throw new Error('Fetch implementation is required for OpenRouter client');
  }

  const timestamps: number[] = [];

  const assertRateLimit = () => {
    const current = now();
    while (timestamps.length > 0 && current - timestamps[0] >= rateLimit.windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= rateLimit.capacity) {
      throw new HttpError(
        429,
        'Daily insight generation limit reached.',
        'INSIGHT_RATE_LIMITED',
        { capacity: rateLimit.capacity, windowMs: rateLimit.windowMs }
      );
    }

    timestamps.push(current);
  };

  return {
    async createChatCompletion(input: ChatCompletionInput): Promise<ChatCompletionResult> {
      if (!apiKey || apiKey.trim().length === 0) {
        throw toHttpError(503, 'OpenRouter credentials are not configured.');
      }

      assertRateLimit();

      const startedAt = now();
      const response = await fetchImpl(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
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
        let errorDetails: unknown = null;
        try {
          errorDetails = await response.json();
        } catch {
          errorDetails = { status: response.status };
        }
        throw toHttpError(502, 'OpenRouter request failed.', {
          status: response.status,
          response: errorDetails
        });
      }

      const payload = (await response.json()) as OpenRouterResponse;
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

export const openRouterClient = createOpenRouterClient();
