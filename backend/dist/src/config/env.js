"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
    WHOOP_CLIENT_ID: zod_1.z.string().optional(),
    WHOOP_CLIENT_SECRET: zod_1.z.string().optional(),
    WHOOP_REDIRECT_URI: zod_1.z.string().url().default('http://localhost:5173/oauth/whoop/callback'),
    WHOOP_TOKEN_ENCRYPTION_KEY: zod_1.z.string().min(16).default('dev-whoop-token-secret'),
    WHOOP_TOKEN_KEY_ID: zod_1.z.string().default('whoop-token-key-v1'),
    RESEND_API_KEY: zod_1.z.string().optional(),
    GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    GOOGLE_CLIENT_SECRET: zod_1.z.string().optional(),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:5173'),
    AUTH_JWT_SECRET: zod_1.z.string().min(10).default('dev-jwt-secret'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    AUTH_REFRESH_ENCRYPTION_KEY: zod_1.z.string().min(10).default('dev-refresh-secret'),
    DASHBOARD_CACHE_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(300),
    DASHBOARD_SNAPSHOT_TTL_SECONDS: zod_1.z.coerce.number().int().positive().default(900)
});
const parsed = envSchema.parse(process.env);
const corsOrigins = parsed.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const env = {
    ...parsed,
    corsOrigins
};
exports.default = env;
