import net from 'node:net';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repoRoot = path.resolve(__dirname, '../../../..');
const backendDir = path.join(repoRoot, 'backend');
const pgBinDir = path.join(repoRoot, 'tools/.tmp/embedded-pg/bin');
const pgCtlBinary = path.join(pgBinDir, 'pg_ctl');
const postgresDataDir = path.join(repoRoot, 'tools/.tmp/t024-pg');
const postgresPort = Number(process.env.TEST_PG_PORT ?? 6543);
const postgresHost = process.env.TEST_PG_HOST ?? '127.0.0.1';
const defaultDatabaseUrl = `postgresql://biohax:biohax@${postgresHost}:${postgresPort}/biohax?schema=public`;

const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;

let embeddedStarted = false;

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

const isEmbeddedRunning = (): boolean => {
  const result = spawnSync(pgCtlBinary, ['-D', postgresDataDir, 'status'], {
    stdio: 'ignore'
  });
  return result.status === 0;
};

const startEmbeddedPostgres = async (): Promise<void> => {
  if (isEmbeddedRunning()) {
    return;
  }

  try {
    execFileSync(pgCtlBinary, ['-D', postgresDataDir, '-o', `-p ${postgresPort}`, 'start'], {
      stdio: 'pipe'
    });
    embeddedStarted = true;
  } catch (error) {
    const output = `${normaliseErrorOutput(error)}\n${error instanceof Error ? error.message : ''}`;
    if (/Address already in use/.test(output) || /could not create any TCP\/IP sockets/.test(output)) {
      await waitForPort(postgresPort, postgresHost, 5000);
      return;
    }

    throw error;
  }

  await waitForPort(postgresPort, postgresHost, 5000);
};

export const ensureDatabaseReady = async (): Promise<void> => {
  process.env.DATABASE_URL = databaseUrl;
  await startEmbeddedPostgres();
};

export const resetDatabase = (): void => {
  execFileSync('npm', ['run', 'db:reset'], {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    stdio: 'pipe'
  });
};

export const shutdownDatabase = (): void => {
  if (!embeddedStarted) {
    return;
  }

  execFileSync(pgCtlBinary, ['-D', postgresDataDir, 'stop', '-m', 'fast'], {
    stdio: 'ignore'
  });
  embeddedStarted = false;
};

export const getDatabaseUrl = (): string => databaseUrl;
