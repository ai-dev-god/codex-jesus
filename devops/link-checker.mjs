#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';

const usage = `Usage: node devops/link-checker.mjs --config <path>

Options:
  --config <path>  JSON configuration describing the expected endpoints.
  --help           Show this message.`;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    configPath: null
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    }
    if (arg === '--config' && i + 1 < args.length) {
      options.configPath = args[i + 1];
      i += 1;
      continue;
    }
    console.error(`[link-check] Unknown argument: ${arg}`);
    console.log(usage);
    process.exit(1);
  }

  return options;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeBase = (value) => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid URL provided: ${value}`);
  }
};

const buildUrl = (base, path) => {
  try {
    return new URL(path, base).toString();
  } catch (error) {
    throw new Error(`Unable to build URL from base=${base} path=${path}: ${error instanceof Error ? error.message : error}`);
  }
};

const runLinkCheck = async (target) => {
  const timeoutMs = target.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(target.url, {
      method: target.method ?? 'GET',
      headers: target.headers ?? {},
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timer);
    const elapsed = Date.now() - startedAt;
    const acceptable = target.expectStatus ?? [200];
    if (!acceptable.includes(response.status)) {
      throw new Error(`expected HTTP ${acceptable.join('/')} but received ${response.status}`);
    }
    console.log(`[link-check][pass] ${target.name} (${response.status}) in ${elapsed}ms`);
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new Error(`${target.name} timed out after ${timeoutMs}ms (${target.url})`);
    }
    throw new Error(`${target.name} failed (${target.url}): ${error instanceof Error ? error.message : String(error)}`);
  }
};

const verifyIntegrations = async (apiBase, requiredIds = [], timeoutMs = 8000) => {
  if (!apiBase || requiredIds.length === 0) {
    return;
  }

  const readinessUrl = buildUrl(apiBase, '/healthz/readiness/');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(readinessUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new Error(`Readiness check timed out after ${timeoutMs}ms (${readinessUrl})`);
    }
    throw new Error(`Unable to query readiness endpoint (${readinessUrl}): ${error instanceof Error ? error.message : String(error)}`);
  }

  if (![200, 503].includes(response.status)) {
    throw new Error(`Readiness endpoint responded with HTTP ${response.status} (${readinessUrl})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Readiness endpoint returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const integrations = payload?.components?.integrations;
  if (!integrations || !Array.isArray(integrations.results)) {
    throw new Error('Readiness payload does not include integration results.');
  }

  const results = integrations.results;
  const requiredSet = new Set(requiredIds);
  const failures = [];

  for (const id of requiredSet) {
    const entry = results.find((result) => result.id === id);
    if (!entry) {
      failures.push(`Integration '${id}' is missing from readiness output`);
      continue;
    }
    if (entry.status !== 'pass') {
      const missing = Array.isArray(entry.missingEnv) && entry.missingEnv.length > 0 ? ` (missing: ${entry.missingEnv.join(', ')})` : '';
      failures.push(`Integration '${entry.name}' is ${entry.status}${missing}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join('; '));
  }

  const degradedOptional = results.filter((result) => result.status !== 'pass' && !requiredSet.has(result.id));
  if (degradedOptional.length > 0) {
    console.warn(
      `[link-check][warn] Optional integrations degraded: ${degradedOptional
        .map((entry) => `${entry.name} (${entry.status})`)
        .join(', ')}`
    );
  }

  console.log(`[link-check][pass] Required integrations (${requiredIds.join(', ')}) are healthy.`);
};

const main = async () => {
  const { configPath } = parseArgs();
  if (!configPath) {
    console.error('[link-check] Missing required --config argument.');
    console.log(usage);
    process.exit(1);
  }

  const resolvedPath = resolvePath(configPath);
  let configRaw;
  try {
    configRaw = await readFile(resolvedPath, 'utf-8');
  } catch (error) {
    console.error(`[link-check] Unable to read config at ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (error) {
    console.error(`[link-check] Config file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const apiBase = normalizeBase(config.apiBase);
  const frontendBase = normalizeBase(config.frontendBase);
  const requiredIntegrations = Array.isArray(config.requireIntegrations) ? config.requireIntegrations : [];
  const checks = [];

  if (apiBase) {
    checks.push({
      name: 'api-liveness',
      url: buildUrl(apiBase, '/healthz/'),
      expectStatus: [200],
      timeoutMs: config.apiTimeoutMs ?? 8000
    });
  }

  if (frontendBase) {
    checks.push({
      name: 'frontend-root',
      url: frontendBase,
      expectStatus: [200, 301, 302],
      timeoutMs: config.frontendTimeoutMs ?? 8000
    });
  }

  if (Array.isArray(config.links)) {
    for (const entry of config.links) {
      if (!entry?.url || !entry?.name) {
        console.warn('[link-check][warn] Skipping malformed link entry (missing name or url).');
        continue;
      }
      checks.push({
        name: entry.name,
        url: entry.url,
        method: entry.method,
        headers: entry.headers,
        expectStatus: entry.expectStatus,
        timeoutMs: entry.timeoutMs
      });
    }
  }

  const failures = [];
  for (const check of checks) {
    try {
      await runLinkCheck(check);
      if (config.sleepBetweenMs) {
        await sleep(Number(config.sleepBetweenMs));
      }
    } catch (error) {
      failures.push(error.message);
    }
  }

  try {
    await verifyIntegrations(apiBase, requiredIntegrations, config.apiTimeoutMs ?? 8000);
  } catch (error) {
    failures.push(error.message);
  }

  if (failures.length > 0) {
    console.error('[link-check] One or more checks failed:');
    for (const failure of failures) {
      console.error(`  • ${failure}`);
    }
    process.exit(1);
  }

  console.log('[link-check] All configured link and integration checks passed.');
};

main().catch((error) => {
  console.error(`[link-check] Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});

