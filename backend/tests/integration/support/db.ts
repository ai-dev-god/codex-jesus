import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

const backendDir = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(backendDir, '..');
const repoToolsDir = path.join(repoRoot, 'tools');

const rawWorkerId = Number(process.env.JEST_WORKER_ID);
const workerId = Number.isInteger(rawWorkerId) ? rawWorkerId : 1;
const workerIndex = workerId > 0 ? workerId - 1 : 0;

const baseEmbeddedPgRoot = path.resolve(
  process.env.EMBEDDED_PG_ROOT ??
    (fs.existsSync(repoToolsDir) ? path.join(repoToolsDir, '.tmp') : path.join(backendDir, '.tmp'))
);
const embeddedPgRoot = path.join(baseEmbeddedPgRoot, `worker-${workerId}`);

fs.mkdirSync(embeddedPgRoot, { recursive: true });

const pgBinDir = path.join(embeddedPgRoot, 'embedded-pg/bin');
const pgCtlBinary = path.join(pgBinDir, 'pg_ctl');
const postgresDataDir = path.join(embeddedPgRoot, `t024-pg-${workerId}`);
const workerScriptPath = path.join(backendDir, 'scripts/embedded-pg-worker.mjs');
const postgresPort = Number(process.env.TEST_PG_PORT ?? 6543) + workerIndex;
const postgresHost = process.env.TEST_PG_HOST ?? '127.0.0.1';
const postgresUser = process.env.TEST_PG_USER ?? 'biohax';
const postgresPassword = process.env.TEST_PG_PASSWORD ?? 'biohax';
const postgresDatabase = process.env.TEST_PG_DATABASE ?? 'biohax';
const defaultDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@${postgresHost}:${postgresPort}/${postgresDatabase}?schema=public`;

const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
const useExternalDatabase =
  process.env.PLAYWRIGHT_USE_EXTERNAL_PG === '1' || process.env.TEST_PG_EXTERNAL === '1';
const pgBinariesAvailable = fs.existsSync(pgCtlBinary);
const shouldUsePgBinaries = !useExternalDatabase && pgBinariesAvailable;
const shouldUseEmbeddedWorker = !useExternalDatabase && !pgBinariesAvailable;
let embeddedStarted = false;
let embeddedWorker: ChildProcess | null = null;
let startPromise: Promise<void> | null = null;

const normaliseErrorOutput = (error: unknown): string => {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const stdout =
    'stdout' in error ? (error as { stdout?: Buffer | string | null }).stdout ?? undefined : undefined;
  const stderr =
    'stderr' in error ? (error as { stderr?: Buffer | string | null }).stderr ?? undefined : undefined;

  const asString = (value: Buffer | string | null | undefined): string => {
    if (value === undefined || value === null) {
      return '';
    }

    return typeof value === 'string' ? value : value.toString('utf8');
  };

  return `${asString(stdout)}\n${asString(stderr)}`.trim();
};

const waitForPort = (port: number, host: string, timeoutMs: number): Promise<void> => {
  const attemptDelayMs = 200;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = (): void => {
      const socket = net.createConnection({ port, host });
      let settled = false;

      const cleanup = (): void => {
        if (!settled) {
          settled = true;
          socket.removeAllListeners();
          socket.destroy();
        }
      };

      socket.once('connect', () => {
        cleanup();
        resolve();
      });

      socket.once('error', () => {
        cleanup();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port} to accept connections`));
          return;
        }
        setTimeout(tryConnect, attemptDelayMs);
      });
    };

    tryConnect();
  });
};

const waitForWorkerReady = (worker: ChildProcess): Promise<void> =>
  new Promise((resolve, reject) => {
    let buffer = '';

    const cleanup = (): void => {
      worker.stdout?.off('data', handleData);
      worker.off('error', handleError);
      worker.off('exit', handleExit);
    };

    const handleData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line === 'READY') {
          cleanup();
          resolve();
          return;
        }
        if (line.startsWith('ERROR')) {
          cleanup();
          reject(new Error(line));
          return;
        }
        newlineIndex = buffer.indexOf('\n');
      }
    };

    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup();
      reject(new Error(`Embedded Postgres worker exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`));
    };

    if (!worker.stdout) {
      cleanup();
      reject(new Error('Embedded Postgres worker stdout unavailable'));
      return;
    }

    worker.stdout.on('data', handleData);
    worker.once('error', handleError);
    worker.once('exit', handleExit);
  });

const startEmbeddedWorker = async (): Promise<void> => {
  if (embeddedWorker) {
    return;
  }

  fs.rmSync(postgresDataDir, { recursive: true, force: true });
  fs.mkdirSync(postgresDataDir, { recursive: true });

  const worker = spawn(process.execPath, [workerScriptPath], {
    env: {
      ...process.env,
      EMBEDDED_PG_ROOT: embeddedPgRoot,
      EMBEDDED_PG_DATA_DIR: postgresDataDir,
      EMBEDDED_PG_PORT: String(postgresPort),
      EMBEDDED_PG_HOST: postgresHost,
      EMBEDDED_PG_USER: postgresUser,
      EMBEDDED_PG_PASSWORD: postgresPassword,
      EMBEDDED_PG_DATABASE: postgresDatabase
    },
    stdio: ['ignore', 'pipe', 'inherit']
  });

  embeddedWorker = worker;

  await waitForWorkerReady(worker);
};

const stopEmbeddedWorker = async (): Promise<void> => {
  if (!embeddedWorker) {
    return;
  }

  const workerRef = embeddedWorker;

  await new Promise<void>((resolve) => {
    const handleExit = (): void => {
      resolve();
    };

    workerRef.once('exit', handleExit);
    workerRef.kill('SIGTERM');

    setTimeout(() => {
      if (workerRef.exitCode === null && workerRef.signalCode === null) {
        workerRef.kill('SIGKILL');
      }
    }, 5000);
  });

  embeddedWorker = null;
};

const isEmbeddedRunning = (): boolean => {
  if (useExternalDatabase) {
    return embeddedStarted;
  }

  if (shouldUseEmbeddedWorker) {
    return embeddedStarted;
  }

  const result = spawnSync(pgCtlBinary, ['-D', postgresDataDir, 'status'], {
    stdio: 'ignore'
  });
  return result.status === 0;
};

const startEmbeddedPostgres = async (): Promise<void> => {
  if (embeddedStarted) {
    return;
  }

  if (startPromise) {
    await startPromise;
    return;
  }

  startPromise = (async () => {
    if (isEmbeddedRunning()) {
      embeddedStarted = true;
      return;
    }

    if (useExternalDatabase) {
      await waitForPort(postgresPort, postgresHost, 5000);
      embeddedStarted = true;
      return;
    }

    if (shouldUsePgBinaries) {
      try {
        execFileSync(pgCtlBinary, ['-D', postgresDataDir, '-o', `-p ${postgresPort}`, 'start'], {
          stdio: 'pipe'
        });
        embeddedStarted = true;
      } catch (error) {
        const output = `${normaliseErrorOutput(error)}\n${error instanceof Error ? error.message : ''}`;
        if (/Address already in use/.test(output) || /could not create any TCP\/IP sockets/.test(output)) {
          await waitForPort(postgresPort, postgresHost, 5000);
          embeddedStarted = true;
          return;
        }

        throw error;
      }
    } else if (shouldUseEmbeddedWorker) {
      await startEmbeddedWorker();
      embeddedStarted = true;
    }

    await waitForPort(postgresPort, postgresHost, 5000);
  })();

  try {
    await startPromise;
  } finally {
    startPromise = null;
  }
};

export const ensureDatabaseReady = async (): Promise<void> => {
  process.env.DATABASE_URL = databaseUrl;
  await startEmbeddedPostgres();
};

const runDbReset = (): void => {
  execFileSync('npm', ['run', 'db:reset'], {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    stdio: 'pipe'
  });
};

export const resetDatabase = async (): Promise<void> => {
  try {
    runDbReset();
  } catch (error) {
    const message = normaliseErrorOutput(error);
    if (!useExternalDatabase && /pg_filenode\.map/.test(message)) {
      await shutdownDatabase();
      embeddedStarted = false;
      await startEmbeddedPostgres();
      runDbReset();
      return;
    }
    throw error;
  }
};

export const shutdownDatabase = async (): Promise<void> => {
  if (!embeddedStarted) {
    return;
  }

  if (useExternalDatabase) {
    embeddedStarted = false;
    return;
  }

  if (shouldUsePgBinaries) {
    execFileSync(pgCtlBinary, ['-D', postgresDataDir, 'stop', '-m', 'fast'], {
      stdio: 'ignore'
    });
  } else if (shouldUseEmbeddedWorker) {
    await stopEmbeddedWorker();
  }

  embeddedStarted = false;
};

export const getDatabaseUrl = (): string => databaseUrl;
