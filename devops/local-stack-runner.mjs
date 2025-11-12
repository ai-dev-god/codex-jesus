#!/usr/bin/env node

/**
 * Embedded local stack runner.
 * Launches Postgres (embedded binary), backend API, and frontend preview server
 * to support Playwright e2e tests when Docker is unavailable.
 */

import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const { values } = parseArgs({
  options: {
    state: { type: 'string', required: true },
    'logs-dir': { type: 'string', required: true },
    'pg-port': { type: 'string' }
  }
});

const statePath = path.resolve(values.state);
const logsDir = path.resolve(values['logs-dir']);
const pgPort = values['pg-port'] ? Number.parseInt(values['pg-port'], 10) : 5544;
const backendPort = 4000;
const frontendPort = 5173;
const postgresUser = 'biohax';
const postgresPassword = 'biohax';
const databaseName = 'biohax';

const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'bh-fe');
const cacheDir = path.join(rootDir, 'devops', '.local-e2e');
const postgresDataDir = path.join(cacheDir, 'postgres-data');

const postgresLogPath = path.join(logsDir, 'postgres.log');
const backendLogPath = path.join(logsDir, 'backend.log');
const frontendLogPath = path.join(logsDir, 'frontend.log');
const setupLogPath = path.join(logsDir, 'setup.log');

const postgresLog = createWriteStream(postgresLogPath, { flags: 'a' });
const backendLog = createWriteStream(backendLogPath, { flags: 'a' });
const frontendLog = createWriteStream(frontendLogPath, { flags: 'a' });
const setupLog = createWriteStream(setupLogPath, { flags: 'a' });

let embeddedPostgres = null;
let backendProcess = null;
let frontendProcess = null;
let shuttingDown = false;

function logSetup(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  setupLog.write(line);
}

async function writeState(payload) {
  const state = {
    daemonPid: process.pid,
    status: payload.status,
    updatedAt: new Date().toISOString(),
    message: payload.message ?? null,
    backendPid: backendProcess?.pid ?? null,
    frontendPid: frontendProcess?.pid ?? null,
    postgresPid: embeddedPostgres?.process?.pid ?? null,
    backendPort,
    frontendPort,
    postgresPort: pgPort
  };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

async function removeStateFile() {
  await fs.rm(statePath, { force: true });
}

async function runCommand(command, args, options, logStream) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });
    const log = (prefix, chunk) => {
      const text = chunk.toString('utf-8');
      logStream.write(text);
    };
    child.stdout?.on('data', (chunk) => log('stdout', chunk));
    child.stderr?.on('data', (chunk) => log('stderr', chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function waitForHttp(url, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function spawnService(command, args, options, logStream) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });
  child.stdout?.on('data', (chunk) => logStream.write(chunk));
  child.stderr?.on('data', (chunk) => logStream.write(chunk));
  return child;
}

async function ensurePostgresCluster(pgModule) {
  const { default: EmbeddedPostgres } = pgModule;
  embeddedPostgres = new EmbeddedPostgres({
    databaseDir: postgresDataDir,
    port: pgPort,
    user: postgresUser,
    password: postgresPassword,
    persistent: true,
    onLog: (msg) => postgresLog.write(msg.toString()),
    onError: (msg) => postgresLog.write(msg instanceof Error ? `${msg.stack}\n` : `${String(msg)}\n`)
  });
  try {
    await embeddedPostgres.initialise();
    logSetup('Postgres cluster initialised.');
  } catch (err) {
    const message = String(err);
    if (message.includes('already exists')) {
      logSetup('Postgres cluster already initialised. Continuing.');
    } else {
      throw err;
    }
  }
  await embeddedPostgres.start();
  logSetup(`Postgres started on port ${pgPort}.`);

  const client = embeddedPostgres.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  const roleIdent = `"${postgresUser.replace(/"/g, '""')}"`;
  const dbIdent = `"${databaseName.replace(/"/g, '""')}"`;

  const roleResult = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [postgresUser]);
  if (roleResult.rowCount === 0) {
    await client.query(`CREATE ROLE ${roleIdent} WITH LOGIN PASSWORD '${postgresPassword}' SUPERUSER CREATEDB CREATEROLE INHERIT`);
  } else {
    await client.query(`ALTER ROLE ${roleIdent} WITH LOGIN PASSWORD '${postgresPassword}' SUPERUSER CREATEDB CREATEROLE INHERIT`);
  }

  const dbResult = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (dbResult.rowCount === 0) {
    await client.query(`CREATE DATABASE ${dbIdent} OWNER ${roleIdent}`);
  } else {
    await client.query(`ALTER DATABASE ${dbIdent} OWNER TO ${roleIdent}`);
  }

  await client.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
  await client.query(`GRANT ALL ON SCHEMA public TO ${roleIdent}`);
  await client.end();
  logSetup('Postgres role and database ensured.');
}

async function startBackend(databaseUrl) {
  const backendEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(backendPort),
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: `http://localhost:${frontendPort}`,
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? 'local-demo-jwt-secret',
    AUTH_REFRESH_ENCRYPTION_KEY: process.env.AUTH_REFRESH_ENCRYPTION_KEY ?? 'local-demo-refresh-secret',
    AUTH_ACCESS_TOKEN_TTL_SECONDS: process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? '900',
    AUTH_REFRESH_TOKEN_TTL_SECONDS: process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? '2592000',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
    WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID ?? '',
    WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET ?? '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
    WHOOP_REDIRECT_URI: process.env.WHOOP_REDIRECT_URI ?? `http://localhost:${frontendPort}/oauth/whoop/callback`
  };

  await runCommand(
    'npm',
    ['run', 'db:reset'],
    { cwd: backendDir, env: backendEnv },
    setupLog
  );
  logSetup('Database reset and seeded.');

  const backendEntry =
    existsSync(path.join(backendDir, 'dist', 'server.js'))
      ? ['dist/server.js']
      : ['dist/src/server.js'];

  backendProcess = spawnService(
    'node',
    backendEntry,
    { cwd: backendDir, env: backendEnv },
    backendLog
  );
  backendProcess.on('exit', (code) => {
    backendLog.write(`Backend process exited with code ${code ?? 'null'}.\n`);
    if (!shuttingDown) {
      void shutdown(1, `Backend process exited unexpectedly with code ${code ?? 'unknown'}.`);
    }
  });

  await waitForHttp(`http://127.0.0.1:${backendPort}/healthz/readiness`, 'backend readiness probe', 120_000);
  logSetup('Backend readiness probe responded 200.');
}

async function startFrontend(databaseUrl) {
  const frontendEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(frontendPort),
    VITE_API_BASE_URL: `http://localhost:${backendPort}`,
    PLAYWRIGHT_BASE_URL: `http://localhost:${frontendPort}`,
    DATABASE_URL: databaseUrl
  };

  const viteBin = path.join(frontendDir, 'node_modules', '.bin', 'vite');
  frontendProcess = spawnService(
    viteBin,
    ['preview', '--host', '0.0.0.0', '--port', String(frontendPort)],
    { cwd: frontendDir, env: frontendEnv },
    frontendLog
  );
  frontendProcess.on('exit', (code) => {
    frontendLog.write(`Frontend process exited with code ${code ?? 'null'}.\n`);
    if (!shuttingDown) {
      void shutdown(1, `Frontend process exited unexpectedly with code ${code ?? 'unknown'}.`);
    }
  });

  await waitForHttp(`http://127.0.0.1:${frontendPort}/`, 'frontend preview server', 120_000);
  logSetup('Frontend preview server responded 200.');
}

async function shutdown(code = 0, message = null) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (message) {
    await writeState({ status: 'error', message });
  } else {
    await writeState({ status: 'stopping' });
  }

  const killProcess = (child, name, logStream) =>
    new Promise((resolve) => {
      if (!child || child.killed) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          logStream.write(`${name} did not exit after SIGTERM. Sending SIGKILL.\n`);
          child.kill('SIGKILL');
        }
      }, 5000);
    });

  await killProcess(frontendProcess, 'Frontend', frontendLog);
  await killProcess(backendProcess, 'Backend', backendLog);

  if (embeddedPostgres) {
    try {
      await embeddedPostgres.stop();
      logSetup('Postgres stopped.');
    } catch (err) {
      postgresLog.write(`Failed to stop Postgres gracefully: ${String(err)}\n`);
    }
  }

  if (!message) {
    await removeStateFile();
  }

  backendLog.end();
  frontendLog.end();
  postgresLog.end();
  setupLog.end();

  process.exit(code);
}

process.on('SIGTERM', () => {
  void shutdown(0);
});
process.on('SIGINT', () => {
  void shutdown(0);
});

async function main() {
  try {
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });

    await writeState({ status: 'starting' });
    logSetup('Starting embedded local stack daemon.');

    const embeddedPath = path.join(
      rootDir,
      'backend',
      'node_modules',
      'embedded-postgres',
      'dist',
      'index.js'
    );
    const pgModule = await import(pathToFileURL(embeddedPath));

    logSetup('Preparing Postgres cluster.');
    await ensurePostgresCluster(pgModule);

    const databaseUrl = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${pgPort}/${databaseName}?schema=public`;

    logSetup('Launching backend service.');
    await startBackend(databaseUrl);
    logSetup('Launching frontend service.');
    await startFrontend(databaseUrl);

    await writeState({ status: 'ready' });
    logSetup('Embedded local stack ready for tests.');

    // Keep process alive
    setInterval(() => {
      // periodic heartbeat
      void writeState({ status: 'ready' });
    }, 10_000).unref();
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : String(err ?? 'Unknown error');
    const detail = err instanceof Error && err.stack ? err.stack : message;
    setupLog.write(`Fatal error: ${detail}\n`);
    await writeState({ status: 'error', message: detail });
    await shutdown(1, detail);
  }
}

await main();
