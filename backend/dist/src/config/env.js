"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_buffer_1 = require("node:buffer");
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv_1.default.config({ path: envFile });
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().int().min(0).default(4000),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required in most environments').optional(),
    REDIS_URL: zod_1.z.string().url().optional(),
    GCP_PROJECT_ID: zod_1.z.string().optional(),
    OPENROUTER_API_KEY: zod_1.z.string().optional(),
    OPENROUTER_BASE_URL: zod_1.z.string().url().default('https://openrouter.ai/api/v1'),
    OPENROUTER_PLANNER_MODEL: zod_1.z
        .string()
        .default('openrouter/openai/gpt-4.1-mini'),
    OPENROUTER_SAFETY_MODEL: zod_1.z
        .string()
        .default('openrouter/google/gemini-2.0-flash'),
    OPENROUTER_NUMERIC_MODEL: zod_1.z
        .string()
        .default('openrouter/deepseek/deepseek-r1-distill-qwen-32b'),
    OPENROUTER_OPENAI5_MODEL: zod_1.z.string().default('openrouter/openai/gpt-5'),
    OPENROUTER_GEMINI25_PRO_MODEL: zod_1.z.string().default('openrouter/google/gemini-2.5-pro'),
    WHOOP_CLIENT_ID: zod_1.z.string().optional(),
    WHOOP_CLIENT_SECRET: zod_1.z.string().optional(),
    WHOOP_REDIRECT_URI: zod_1.z.string().url().default('http://localhost:5173/oauth/whoop/callback'),
    WHOOP_TOKEN_ENCRYPTION_KEY: zod_1.z.string().min(16).default('dev-whoop-token-secret'),
    WHOOP_TOKEN_KEY_ID: zod_1.z.string().default('whoop-token-key-v1'),
    STRAVA_CLIENT_ID: zod_1.z.string().optional(),
    STRAVA_CLIENT_SECRET: zod_1.z.string().optional(),
    STRAVA_REDIRECT_URI: zod_1.z.string().url().default('http://localhost:5173/oauth/strava/callback'),
    STRAVA_TOKEN_ENCRYPTION_KEY: zod_1.z.string().min(16).default('dev-strava-token-secret'),
    STRAVA_TOKEN_KEY_ID: zod_1.z.string().default('strava-token-key-v1'),
    RESEND_API_KEY: zod_1.z.string().optional(),
    GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    GOOGLE_CLIENT_SECRET: zod_1.z.string().optional(),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:5173'),
    AUTH_JWT_SECRET: zod_1.z.string().min(10).default('dev-jwt-secret'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    AUTH_REFRESH_ENCRYPTION_KEY: zod_1.z.string().min(10).default('dev-refresh-secret'),
    DASHBOARD_CACHE_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(300),
    DASHBOARD_SNAPSHOT_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(900),
    PANEL_UPLOAD_DOWNLOAD_BASE_URL: zod_1.z.string().url().default('https://storage.biohax.pro'),
    LAB_UPLOAD_BUCKET: zod_1.z.string().min(3, 'LAB_UPLOAD_BUCKET is required for lab uploads').default('labs-dev-bucket'),
    LAB_UPLOAD_KMS_KEY_NAME: zod_1.z.string().min(1).optional(),
    LAB_UPLOAD_SIGNED_URL_TTL_SECONDS: zod_1.z.coerce.number().int().min(60).max(7200).default(900),
    LAB_UPLOAD_MAX_SIZE_MB: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    LAB_UPLOAD_SEALING_KEY: zod_1.z.string().min(44).default(node_buffer_1.Buffer.alloc(32).toString('base64')),
    LAB_UPLOAD_DOWNLOAD_TTL_SECONDS: zod_1.z.coerce.number().int().min(60).max(3600).default(300),
    AI_LONGEVITY_PLAN_ENABLED: zod_1.z.coerce.boolean().default(false),
    ALLOW_EMAIL_SIGNUPS: zod_1.z.coerce.boolean().default(false)
});
const rawEnv = { ...process.env };
if (!rawEnv.AUTH_JWT_SECRET && rawEnv.JWT_SECRET) {
    rawEnv.AUTH_JWT_SECRET = rawEnv.JWT_SECRET;
}
const parsed = envSchema.parse(rawEnv);
if (parsed.NODE_ENV === 'production') {
    const forbiddenDefaults = [
        ['AUTH_JWT_SECRET', 'dev-jwt-secret'],
        ['AUTH_REFRESH_ENCRYPTION_KEY', 'dev-refresh-secret'],
        ['WHOOP_TOKEN_ENCRYPTION_KEY', 'dev-whoop-token-secret'],
        ['STRAVA_TOKEN_ENCRYPTION_KEY', 'dev-strava-token-secret']
    ];
    const requireSecret = (key, defaultValue) => {
        const value = parsed[key];
        if (!value || typeof value !== 'string') {
            throw new Error(`${key} is required when NODE_ENV=${parsed.NODE_ENV}`);
        }
        if (value === defaultValue) {
            throw new Error(`${key} must be set to a non-default value when NODE_ENV=${parsed.NODE_ENV}. Provide a strong secret via environment variables.`);
        }
    };
    forbiddenDefaults.forEach(([key, defaultValue]) => requireSecret(key, defaultValue));
    if (!parsed.LAB_UPLOAD_KMS_KEY_NAME?.trim()) {
        throw new Error('LAB_UPLOAD_KMS_KEY_NAME is required when NODE_ENV=production');
    }
    requireSecret('LAB_UPLOAD_SEALING_KEY', '');
}
const parseCorsOrigins = (value) => {
    if (!value) {
        return [];
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return [];
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsedValue = JSON.parse(trimmed);
            if (Array.isArray(parsedValue)) {
                return parsedValue.map((origin) => `${origin}`.trim()).filter(Boolean);
            }
        }
        catch {
            // Fallback to delimiter-based parsing when JSON parsing fails.
        }
    }
    return trimmed
        .split(/[\s,]+/)
        .map((origin) => origin.trim())
        .filter(Boolean);
};
const corsOrigins = parseCorsOrigins(parsed.CORS_ORIGIN);
const env = {
    ...parsed,
    corsOrigins
};
exports.default = env;
