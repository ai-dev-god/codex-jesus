#!/usr/bin/env node

/**
 * Local stack controller used when Docker is unavailable.
 * Spawns the embedded stack daemon which launches Postgres, backend, and frontend
 * using user-space binaries. The daemon keeps running until stopped explicitly.
 */

import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const defaultTaskId = process.env.TASK_ID ?? 't-040';

const DEFAULT_STATE = path.join(rootDir, 'devops', '.local-e2e', 'state.json');
const DEFAULT_LOGS_DIR = path.join(
  rootDir,
  'platform',
  'automation_artifacts',
  'tasks',
  defaultTaskId,
  'release',
  'local-stack'
);

const { values, positionals } = parseArgs({
  options: {
    state: { type: 'string' },
    'logs-dir': { type: 'string' },
    timeout: { type: 'string' }
  },
  allowPositionals: true
});

if (positionals.length === 0) {
  console.error('Usage: local-stack-controller.mjs <start|stop|status> [--state <file>] [--logs-dir <dir>] [--timeout <ms>]');
  process.exit(1);
}

const command = positionals[0];
const statePath = path.resolve(values.state ?? DEFAULT_STATE);
const logsDir = path.resolve(values['logs-dir'] ?? DEFAULT_LOGS_DIR);
const timeoutMs = values.timeout ? Number.parseInt(values.timeout, 10) : 240_000;

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readState() {
  if (!(await fileExists(statePath))) {
    return null;
  }
  const raw = await fs.readFile(statePath, 'utf-8');
  return JSON.parse(raw);
}

async function startStack() {
  if (await fileExists(statePath)) {
    const existing = await readState();
    if (existing && existing.status === 'ready' && existing.daemonPid) {
      try {
        process.kill(existing.daemonPid, 0);
        return;
      } catch {
        // process not running; fall through to restart
      }
    }
    await fs.rm(statePath, { force: true });
  }

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });

  const runnerPath = path.resolve(__dirname, 'local-stack-runner.mjs');

  const child = spawn(
    process.execPath,
    [runnerPath, '--state', statePath, '--logs-dir', logsDir],
    {
      cwd: rootDir,
      env: process.env,
      detached: true,
      stdio: 'ignore'
    }
  );
  child.unref();

  const deadline = Date.now() + timeoutMs;

  /* eslint-disable no-constant-condition */
  while (true) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the embedded stack to become ready.');
    }
    const state = await readState();
    if (state) {
      if (state.status === 'ready') {
        return;
      }
      if (state.status === 'error') {
        const message = state.message ?? 'Embedded stack failed during start.';
        if (state.daemonPid) {
          try {
            process.kill(state.daemonPid, 0);
          } catch {
            // daemon no longer running
          }
        }
        await fs.rm(statePath, { force: true });
        throw new Error(message);
      }
    }
    await sleep(1000);
  }
  /* eslint-enable no-constant-condition */
}

async function stopStack() {
  const state = await readState();
  if (!state) {
    return;
  }
  if (!state.daemonPid) {
    throw new Error('Cannot stop embedded stack: daemonPid missing from state file.');
  }

  try {
    process.kill(state.daemonPid, 'SIGTERM');
  } catch (err) {
    if (err.code !== 'ESRCH') {
      throw err;
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (await fileExists(statePath)) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for embedded stack to stop.');
    }
    await sleep(500);
  }
}

async function statusStack() {
  const state = await readState();
  if (!state) {
    console.log('status: stopped');
    return;
  }
  console.log(JSON.stringify(state, null, 2));
}

async function main() {
  try {
    if (command === 'start') {
      await startStack();
    } else if (command === 'stop') {
      await stopStack();
    } else if (command === 'status') {
      await statusStack();
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}

main();
