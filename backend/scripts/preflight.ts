import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';

type Mode = 'strict' | 'relaxed';

type ArgvOptions = {
  envFile?: string;
  mode?: Mode;
};

type CheckStatus = 'passed' | 'failed' | 'skipped';

type CheckResult = {
  name: string;
  status: CheckStatus;
  detail?: string;
};

type RequiredEnv = {
  key: string;
  label: string;
};

const DEFAULTS = {
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_OPENCHAT5_MODEL: 'openrouter/openchat/openchat-5',
  OPENROUTER_GEMINI25_PRO_MODEL: 'openrouter/google/gemini-2.5-pro'
};

const PLACEHOLDER_TOKENS = ['demo', 'changeme', 'change-me', 'placeholder'];

const parseArgs = (argv: string[]): ArgvOptions => {
  const options: ArgvOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (entry === '--env-file' && argv[i + 1]) {
      options.envFile = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (entry.startsWith('--env-file=')) {
      options.envFile = path.resolve(entry.slice('--env-file='.length));
      continue;
    }
    if (entry === '--mode' && argv[i + 1]) {
      options.mode = argv[i + 1] as Mode;
      i += 1;
      continue;
    }
    if (entry.startsWith('--mode=')) {
      options.mode = entry.slice('--mode='.length) as Mode;
      continue;
    }
  }
  return options;
};

const args = parseArgs(process.argv.slice(2));

if (args.envFile) {
  dotenv.config({ path: args.envFile, override: true });
} else {
  dotenv.config();
}

const deriveMode = (): Mode => {
  const envValue = (args.mode ?? process.env.QA_PREFLIGHT_MODE ?? '').toLowerCase();
  if (envValue === 'strict' || envValue === 'relaxed') {
    return envValue;
  }
  return process.env.NODE_ENV === 'production' ? 'strict' : 'relaxed';
};

const mode = deriveMode();

const results: CheckResult[] = [];

const record = (result: CheckResult): void => {
  results.push(result);
  const statusLabel =
    result.status === 'passed' ? 'PASS' : result.status === 'failed' ? 'FAIL' : 'SKIP';
  const detail = result.detail ? ` – ${result.detail}` : '';
  // eslint-disable-next-line no-console
  console.log(`[${statusLabel}] ${result.name}${detail}`);
};

const isPlaceholder = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_TOKENS.some((token) => normalized === token || normalized.startsWith(`${token}-`));
};

const validateEnv = (entry: RequiredEnv): string | null => {
  const raw = process.env[entry.key];
  if (!raw || raw.trim().length === 0) {
    if (mode === 'strict') {
      record({
        name: `env:${entry.key}`,
        status: 'failed',
        detail: `${entry.label} is not configured`
      });
    } else {
      record({
        name: `env:${entry.key}`,
        status: 'skipped',
        detail: `${entry.label} not provided (relaxed mode)`
      });
    }
    return null;
  }

  if (mode === 'strict' && isPlaceholder(raw)) {
    record({
      name: `env:${entry.key}`,
      status: 'failed',
      detail: `${entry.label} uses a placeholder value (${raw})`
    });
    return null;
  }

  record({
    name: `env:${entry.key}`,
    status: 'passed',
    detail: `${entry.label} present`
  });
  return raw.trim();
};

const checkFileExists = async (label: string, filePath: string | null): Promise<void> => {
  if (!filePath) {
    return;
  }
  try {
    await fs.access(filePath);
    record({ name: `file:${label}`, status: 'passed', detail: filePath });
  } catch (error) {
    record({
      name: `file:${label}`,
      status: mode === 'strict' ? 'failed' : 'skipped',
      detail:
        mode === 'strict'
          ? `File ${filePath} is not readable`
          : `Missing file ${filePath} (relaxed mode)`
    });
  }
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
};

const checkDatabaseConnectivity = async (databaseUrl: string | null): Promise<void> => {
  if (!databaseUrl) {
    return;
  }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 8000);
    record({ name: 'database:connectivity', status: 'passed', detail: 'Prisma handshake ok' });
  } catch (error) {
    record({
      name: 'database:connectivity',
      status: 'failed',
      detail: `Unable to reach database: ${(error as Error).message}`
    });
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
};

const fetchJson = async (url: string, headers: Record<string, string>, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
};

const checkOpenRouter = async (
  apiKey: string | null,
  requiredModels: string[]
): Promise<void> => {
  if (!apiKey) {
    return;
  }
  const baseUrl = (process.env.OPENROUTER_BASE_URL ?? DEFAULTS.OPENROUTER_BASE_URL).replace(/\/+$/, '');
  const endpoint = `${baseUrl}/models`;

  try {
    const response = await fetchJson(endpoint, {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const serialized = JSON.stringify(response.payload).toLowerCase();
    const missing = requiredModels
      .map((model) => model.trim().toLowerCase())
      .filter((model) => model.length > 0 && !serialized.includes(model));
    if (missing.length > 0) {
      record({
        name: 'openrouter:models',
        status: 'failed',
        detail: `Missing model entries: ${missing.join(', ')}`
      });
      return;
    }
    record({ name: 'openrouter:models', status: 'passed', detail: 'Required models available' });
  } catch (error) {
    record({
      name: 'openrouter:models',
      status: 'failed',
      detail: `Unable to query OpenRouter: ${(error as Error).message}`
    });
  }
};

const validateUrlShape = (key: string, value: string | null, options: { httpsOnly?: boolean; disallowLocalhost?: boolean } = {}): void => {
  if (!value) {
    return;
  }
  try {
    const parsed = new URL(value);
    if (options.httpsOnly && parsed.protocol !== 'https:') {
      const detail =
        mode === 'strict'
          ? 'must use https'
          : 'non-https URL accepted in relaxed mode';
      record({
        name: `url:${key}`,
        status: options.httpsOnly && mode === 'strict' ? 'failed' : 'skipped',
        detail
      });
      return;
    }
    if (options.disallowLocalhost && parsed.hostname.includes('localhost')) {
      record({
        name: `url:${key}`,
        status: mode === 'strict' ? 'failed' : 'skipped',
        detail: mode === 'strict' ? 'localhost not allowed for production deploy' : 'localhost allowed in relaxed mode'
      });
      return;
    }

    record({
      name: `url:${key}`,
      status: 'passed',
      detail: parsed.origin
    });
  } catch (error) {
    record({
      name: `url:${key}`,
      status: 'failed',
      detail: `Invalid URL (${(error as Error).message})`
    });
  }
};

const run = async () => {
  // Required env secrets
  const requiredSecrets: RequiredEnv[] = [
    { key: 'DATABASE_URL', label: 'Database URL' },
    { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API key' },
    { key: 'WHOOP_CLIENT_ID', label: 'Whoop client id' },
    { key: 'WHOOP_CLIENT_SECRET', label: 'Whoop client secret' },
    { key: 'RESEND_API_KEY', label: 'Resend API key' },
    { key: 'GOOGLE_CLIENT_ID', label: 'Google OAuth client id' },
    { key: 'GOOGLE_CLIENT_SECRET', label: 'Google OAuth client secret' }
  ];

  const envValues = new Map<string, string>();
  for (const secret of requiredSecrets) {
    const value = validateEnv(secret);
    if (value) {
      envValues.set(secret.key, value);
    }
  }

  await checkDatabaseConnectivity(envValues.get('DATABASE_URL') ?? null);
  await checkFileExists('google-credentials', process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null);

  const requiredModels = [
    process.env.OPENROUTER_OPENCHAT5_MODEL ?? DEFAULTS.OPENROUTER_OPENCHAT5_MODEL,
    process.env.OPENROUTER_GEMINI25_PRO_MODEL ?? DEFAULTS.OPENROUTER_GEMINI25_PRO_MODEL
  ];
  await checkOpenRouter(envValues.get('OPENROUTER_API_KEY') ?? null, requiredModels);

  validateUrlShape('WHOOP_REDIRECT_URI', process.env.WHOOP_REDIRECT_URI ?? null, {
    httpsOnly: mode === 'strict',
    disallowLocalhost: mode === 'strict'
  });
  validateUrlShape('CORS_ORIGIN', process.env.CORS_ORIGIN ?? null, {
    httpsOnly: false,
    disallowLocalhost: false
  });
  validateUrlShape('PANEL_UPLOAD_DOWNLOAD_BASE_URL', process.env.PANEL_UPLOAD_DOWNLOAD_BASE_URL ?? null, {
    httpsOnly: true
  });
};

run()
  .then(() => {
    const failed = results.filter((result) => result.status === 'failed');
    if (failed.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\nPreflight failed (${failed.length} check${failed.length === 1 ? '' : 's'}).`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log('\nPreflight guardrails passed.');
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`Preflight aborted: ${(error as Error).message}`);
    process.exit(1);
  });

