"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabaseUrl = exports.shutdownDatabase = exports.resetDatabase = exports.ensureDatabaseReady = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_net_1 = __importDefault(require("node:net"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const backendDir = node_path_1.default.resolve(__dirname, '../../..');
const repoRoot = node_path_1.default.resolve(backendDir, '..');
const repoToolsDir = node_path_1.default.join(repoRoot, 'tools');
const rawWorkerId = Number(process.env.JEST_WORKER_ID);
const workerId = Number.isInteger(rawWorkerId) ? rawWorkerId : 1;
const workerIndex = workerId > 0 ? workerId - 1 : 0;
const baseEmbeddedPgRoot = node_path_1.default.resolve(process.env.EMBEDDED_PG_ROOT ??
    (node_fs_1.default.existsSync(repoToolsDir) ? node_path_1.default.join(repoToolsDir, '.tmp') : node_path_1.default.join(backendDir, '.tmp')));
const embeddedPgRoot = node_path_1.default.join(baseEmbeddedPgRoot, `worker-${workerId}`);
node_fs_1.default.mkdirSync(embeddedPgRoot, { recursive: true });
const pgBinDir = node_path_1.default.join(embeddedPgRoot, 'embedded-pg/bin');
const pgCtlBinary = node_path_1.default.join(pgBinDir, 'pg_ctl');
const postgresDataDir = node_path_1.default.join(embeddedPgRoot, `t024-pg-${workerId}`);
const workerScriptPath = node_path_1.default.join(backendDir, 'scripts/embedded-pg-worker.mjs');
const postgresPort = Number(process.env.TEST_PG_PORT ?? 6543) + workerIndex;
const postgresHost = process.env.TEST_PG_HOST ?? '127.0.0.1';
const postgresUser = process.env.TEST_PG_USER ?? 'biohax';
const postgresPassword = process.env.TEST_PG_PASSWORD ?? 'biohax';
const postgresDatabase = process.env.TEST_PG_DATABASE ?? 'biohax';
const defaultDatabaseUrl = process.env.TEST_DATABASE_URL ??
    `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@${postgresHost}:${postgresPort}/${postgresDatabase}?schema=public`;
const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
const useExternalDatabase = process.env.PLAYWRIGHT_USE_EXTERNAL_PG === '1' || process.env.TEST_PG_EXTERNAL === '1';
const pgBinariesAvailable = node_fs_1.default.existsSync(pgCtlBinary);
const shouldUsePgBinaries = !useExternalDatabase && pgBinariesAvailable;
const shouldUseEmbeddedWorker = !useExternalDatabase && !pgBinariesAvailable;
let embeddedStarted = false;
let embeddedWorker = null;
let startPromise = null;
const normaliseErrorOutput = (error) => {
    if (!error || typeof error !== 'object') {
        return '';
    }
    const stdout = 'stdout' in error ? error.stdout ?? undefined : undefined;
    const stderr = 'stderr' in error ? error.stderr ?? undefined : undefined;
    const asString = (value) => {
        if (value === undefined || value === null) {
            return '';
        }
        return typeof value === 'string' ? value : value.toString('utf8');
    };
    return `${asString(stdout)}\n${asString(stderr)}`.trim();
};
const waitForPort = (port, host, timeoutMs) => {
    const attemptDelayMs = 200;
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tryConnect = () => {
            const socket = node_net_1.default.createConnection({ port, host });
            let settled = false;
            const cleanup = () => {
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
const waitForWorkerReady = (worker) => new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
        worker.stdout?.off('data', handleData);
        worker.off('error', handleError);
        worker.off('exit', handleExit);
    };
    const handleData = (chunk) => {
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
    const handleError = (error) => {
        cleanup();
        reject(error);
    };
    const handleExit = (code, signal) => {
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
const startEmbeddedWorker = async () => {
    if (embeddedWorker) {
        return;
    }
    node_fs_1.default.rmSync(postgresDataDir, { recursive: true, force: true });
    node_fs_1.default.mkdirSync(postgresDataDir, { recursive: true });
    const worker = (0, node_child_process_1.spawn)(process.execPath, [workerScriptPath], {
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
const stopEmbeddedWorker = async () => {
    if (!embeddedWorker) {
        return;
    }
    const workerRef = embeddedWorker;
    await new Promise((resolve) => {
        const handleExit = () => {
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
const isEmbeddedRunning = () => {
    if (useExternalDatabase) {
        return embeddedStarted;
    }
    if (shouldUseEmbeddedWorker) {
        return embeddedStarted;
    }
    const result = (0, node_child_process_1.spawnSync)(pgCtlBinary, ['-D', postgresDataDir, 'status'], {
        stdio: 'ignore'
    });
    return result.status === 0;
};
const startEmbeddedPostgres = async () => {
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
                (0, node_child_process_1.execFileSync)(pgCtlBinary, ['-D', postgresDataDir, '-o', `-p ${postgresPort}`, 'start'], {
                    stdio: 'pipe'
                });
                embeddedStarted = true;
            }
            catch (error) {
                const output = `${normaliseErrorOutput(error)}\n${error instanceof Error ? error.message : ''}`;
                if (/Address already in use/.test(output) || /could not create any TCP\/IP sockets/.test(output)) {
                    await waitForPort(postgresPort, postgresHost, 5000);
                    embeddedStarted = true;
                    return;
                }
                throw error;
            }
        }
        else if (shouldUseEmbeddedWorker) {
            await startEmbeddedWorker();
            embeddedStarted = true;
        }
        await waitForPort(postgresPort, postgresHost, 5000);
    })();
    try {
        await startPromise;
    }
    finally {
        startPromise = null;
    }
};
const ensureDatabaseReady = async () => {
    process.env.DATABASE_URL = databaseUrl;
    await startEmbeddedPostgres();
};
exports.ensureDatabaseReady = ensureDatabaseReady;
const runDbReset = () => {
    (0, node_child_process_1.execFileSync)('npm', ['run', 'db:reset'], {
        cwd: backendDir,
        env: {
            ...process.env,
            DATABASE_URL: databaseUrl
        },
        stdio: 'pipe'
    });
};
const resetDatabase = async () => {
    try {
        runDbReset();
    }
    catch (error) {
        const message = normaliseErrorOutput(error);
        if (!useExternalDatabase && /pg_filenode\.map/.test(message)) {
            await (0, exports.shutdownDatabase)();
            embeddedStarted = false;
            await startEmbeddedPostgres();
            runDbReset();
            return;
        }
        throw error;
    }
};
exports.resetDatabase = resetDatabase;
const shutdownDatabase = async () => {
    if (!embeddedStarted) {
        return;
    }
    if (useExternalDatabase) {
        embeddedStarted = false;
        return;
    }
    if (shouldUsePgBinaries) {
        (0, node_child_process_1.execFileSync)(pgCtlBinary, ['-D', postgresDataDir, 'stop', '-m', 'fast'], {
            stdio: 'ignore'
        });
    }
    else if (shouldUseEmbeddedWorker) {
        await stopEmbeddedWorker();
    }
    embeddedStarted = false;
};
exports.shutdownDatabase = shutdownDatabase;
const getDatabaseUrl = () => databaseUrl;
exports.getDatabaseUrl = getDatabaseUrl;
