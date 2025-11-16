import { Buffer } from 'node:buffer';
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
  OPENROUTER_OPENAI5_MODEL: z.string().default('openrouter/openai/gpt-5'),
  OPENROUTER_GEMINI25_PRO_MODEL: z.string().default('openrouter/google/gemini-2.5-pro'),
  WHOOP_CLIENT_ID: z.string().optional(),
  WHOOP_CLIENT_SECRET: z.string().optional(),
  WHOOP_REDIRECT_URI: z.string().url().default('http://localhost:5173/oauth/whoop/callback'),
  WHOOP_TOKEN_ENCRYPTION_KEY: z.string().min(16).default('dev-whoop-token-secret'),
  WHOOP_TOKEN_KEY_ID: z.string().default('whoop-token-key-v1'),
  WHOOP_WEBHOOK_SECRET: z.string().min(16).default('dev-whoop-webhook-secret'),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_REDIRECT_URI: z.string().url().default('http://localhost:5173/oauth/strava/callback'),
  STRAVA_TOKEN_ENCRYPTION_KEY: z.string().min(16).default('dev-strava-token-secret'),
  STRAVA_TOKEN_KEY_ID: z.string().default('strava-token-key-v1'),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  AUTH_JWT_SECRET: z.string().min(10).default('dev-jwt-secret'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  AUTH_REFRESH_ENCRYPTION_KEY: z.string().min(10).default('dev-refresh-secret'),
  DASHBOARD_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  DASHBOARD_SNAPSHOT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  PANEL_UPLOAD_DOWNLOAD_BASE_URL: z.string().url().default('https://storage.biohax.pro'),
  LAB_UPLOAD_BUCKET: z.string().min(3, 'LAB_UPLOAD_BUCKET is required for lab uploads').default('labs-dev-bucket'),
  LAB_UPLOAD_KMS_KEY_NAME: z.string().min(1).optional(),
  LAB_UPLOAD_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(7200).default(900),
  LAB_UPLOAD_MAX_SIZE_MB: z.coerce.number().int().min(1).max(100).default(25),
  LAB_UPLOAD_SEALING_KEY: z.string().min(44).default(Buffer.alloc(32).toString('base64')),
  LAB_UPLOAD_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  AI_LONGEVITY_PLAN_ENABLED: z.coerce.boolean().default(false),
  ALLOW_EMAIL_SIGNUPS: z.coerce.boolean().default(false)
});

const rawEnv = { ...process.env };
if (!rawEnv.AUTH_JWT_SECRET && rawEnv.JWT_SECRET) {
  rawEnv.AUTH_JWT_SECRET = rawEnv.JWT_SECRET;
}

const parsed = envSchema.parse(rawEnv);

if (parsed.NODE_ENV === 'production') {
  type SecretKey =
    | 'AUTH_JWT_SECRET'
    | 'AUTH_REFRESH_ENCRYPTION_KEY'
    | 'WHOOP_TOKEN_ENCRYPTION_KEY'
    | 'STRAVA_TOKEN_ENCRYPTION_KEY'
    | 'WHOOP_WEBHOOK_SECRET';
    | 'LAB_UPLOAD_SEALING_KEY';
  const forbiddenDefaults: Array<[SecretKey, string]> = [
    ['AUTH_JWT_SECRET', 'dev-jwt-secret'],
    ['AUTH_REFRESH_ENCRYPTION_KEY', 'dev-refresh-secret'],
    ['WHOOP_TOKEN_ENCRYPTION_KEY', 'dev-whoop-token-secret'],
    ['STRAVA_TOKEN_ENCRYPTION_KEY', 'dev-strava-token-secret'],
    ['WHOOP_WEBHOOK_SECRET', 'dev-whoop-webhook-secret']
  ];

  const requireSecret = (key: SecretKey, defaultValue: string): void => {
    const value = parsed[key];
    if (!value || typeof value !== 'string') {
      throw new Error(`${key} is required when NODE_ENV=${parsed.NODE_ENV}`);
    }

    if (value === defaultValue) {
      throw new Error(
        `${key} must be set to a non-default value when NODE_ENV=${parsed.NODE_ENV}. Provide a strong secret via environment variables.`
      );
    }
  };

  forbiddenDefaults.forEach(([key, defaultValue]) => requireSecret(key, defaultValue));

  if (!parsed.LAB_UPLOAD_KMS_KEY_NAME?.trim()) {
    throw new Error('LAB_UPLOAD_KMS_KEY_NAME is required when NODE_ENV=production');
  }
  requireSecret('LAB_UPLOAD_SEALING_KEY', '');
}
const parseCorsOrigins = (value: string): string[] => {
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
    } catch {
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

export default env;
