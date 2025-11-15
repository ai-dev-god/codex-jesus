import { z } from 'zod';
import dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required in most environments').optional(),
  REDIS_URL: z.string().url().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_PLANNER_MODEL: z
    .string()
    .default('openrouter/openai/gpt-4.1-mini'),
  OPENROUTER_SAFETY_MODEL: z
    .string()
    .default('openrouter/google/gemini-2.0-flash'),
  OPENROUTER_NUMERIC_MODEL: z
    .string()
    .default('openrouter/deepseek/deepseek-r1-distill-qwen-32b'),
  WHOOP_CLIENT_ID: z.string().optional(),
  WHOOP_CLIENT_SECRET: z.string().optional(),
  WHOOP_REDIRECT_URI: z.string().url().default('http://localhost:5173/oauth/whoop/callback'),
  WHOOP_TOKEN_ENCRYPTION_KEY: z.string().min(16).default('dev-whoop-token-secret'),
  WHOOP_TOKEN_KEY_ID: z.string().default('whoop-token-key-v1'),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_JWT_SECRET: z.string().min(10).default('dev-jwt-secret'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  AUTH_REFRESH_ENCRYPTION_KEY: z.string().min(10).default('dev-refresh-secret'),
  DASHBOARD_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  DASHBOARD_SNAPSHOT_TTL_SECONDS: z.coerce.number().int().positive().default(900)
});

const parsed = envSchema.parse(process.env);
const corsOrigins = parsed.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

const env = {
  ...parsed,
  corsOrigins
};

export default env;
