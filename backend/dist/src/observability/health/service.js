"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthService = exports.HealthService = void 0;
const redis_1 = require("redis");
const env_1 = __importDefault(require("../../config/env"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const metrics_1 = require("../metrics");
const logger_1 = require("../logger");
const defaultIntegrationEnv = {
    NODE_ENV: env_1.default.NODE_ENV,
    STRAVA_CLIENT_ID: env_1.default.STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET: env_1.default.STRAVA_CLIENT_SECRET,
    STRAVA_REDIRECT_URI: env_1.default.STRAVA_REDIRECT_URI,
    WHOOP_CLIENT_ID: env_1.default.WHOOP_CLIENT_ID,
    WHOOP_CLIENT_SECRET: env_1.default.WHOOP_CLIENT_SECRET,
    WHOOP_REDIRECT_URI: env_1.default.WHOOP_REDIRECT_URI,
    RESEND_API_KEY: env_1.default.RESEND_API_KEY,
    GOOGLE_CLIENT_ID: env_1.default.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env_1.default.GOOGLE_CLIENT_SECRET
};
const buildIntegrationEnv = (overrides) => ({
    ...defaultIntegrationEnv,
    ...overrides
});
const INTEGRATION_DEFINITIONS = [
    {
        id: 'strava',
        name: 'Strava OAuth',
        required: [
            { key: 'STRAVA_CLIENT_ID' },
            { key: 'STRAVA_CLIENT_SECRET' },
            { key: 'STRAVA_REDIRECT_URI', disallowLocalhostInProduction: true }
        ],
        docs: 'docs/gcp-access-and-deployment.md#link--integration-preflight',
        critical: true
    },
    {
        id: 'whoop',
        name: 'Whoop OAuth',
        required: [
            { key: 'WHOOP_CLIENT_ID' },
            { key: 'WHOOP_CLIENT_SECRET' },
            { key: 'WHOOP_REDIRECT_URI', disallowLocalhostInProduction: true }
        ],
        docs: 'docs/gcp-access-and-deployment.md#link--integration-preflight',
        critical: true
    },
    {
        id: 'google-oauth',
        name: 'Google OAuth',
        required: [
            { key: 'GOOGLE_CLIENT_ID' },
            { key: 'GOOGLE_CLIENT_SECRET' }
        ],
        docs: 'docs/gcp-access-and-deployment.md#link--integration-preflight',
        critical: true
    },
    {
        id: 'resend',
        name: 'Resend Email',
        required: [{ key: 'RESEND_API_KEY' }],
        docs: 'docs/gcp-access-and-deployment.md#link--integration-preflight',
        critical: false
    }
];
const integrationStatusFromResults = (results) => {
    if (results.some((result) => result.status === 'fail')) {
        return 'fail';
    }
    if (results.some((result) => result.status === 'degraded')) {
        return 'degraded';
    }
    return 'pass';
};
const valueIsPresent = (value) => typeof value === 'string' && value.trim().length > 0;
const isLocalhostUrl = (value) => {
    try {
        const parsed = new URL(value);
        return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase());
    }
    catch {
        return false;
    }
};
const QUEUE_ACTIVE_STATUSES = ['PENDING', 'DISPATCHED'];
const computeLagSeconds = (now, ...timestamps) => {
    const reference = timestamps.filter((value) => value instanceof Date).reduce((earliest, current) => {
        if (!earliest) {
            return current;
        }
        return current && current < earliest ? current : earliest;
    }, null);
    if (!reference) {
        return null;
    }
    const diffMs = now.getTime() - reference.getTime();
    return diffMs <= 0 ? 0 : Number((diffMs / 1000).toFixed(3));
};
const globalLogger = logger_1.baseLogger.with({ component: 'health' });
class HealthService {
    constructor(options = {}) {
        this.prisma = options.prisma ?? prisma_1.default;
        this.redisProbe = options.redisProbe;
        this.redisUrl = options.redisUrl ?? env_1.default.REDIS_URL;
        this.now = options.now ?? (() => new Date());
        this.integrationEnv = buildIntegrationEnv(options.integrationEnv);
    }
    async liveness() {
        const now = this.now();
        return {
            status: 'ok',
            service: 'biohax-backend',
            timestamp: now.toISOString(),
            uptimeSeconds: Math.round(process.uptime())
        };
    }
    async readiness() {
        const now = this.now();
        const [database, redis, queues, integrations] = await Promise.all([
            this.checkDatabase(now),
            this.checkRedis(now),
            this.checkQueues(now),
            this.checkIntegrations(now)
        ]);
        const status = this.overallStatus(database, redis, queues.status, integrations.status);
        return {
            status,
            checkedAt: now.toISOString(),
            components: {
                database,
                redis,
                queues,
                integrations,
                metrics: (0, metrics_1.getMetricsSnapshot)()
            }
        };
    }
    overallStatus(database, redis, queueStatus, integrationStatus) {
        if (database.status === 'fail' || redis.status === 'fail' || integrationStatus === 'fail') {
            return 'fail';
        }
        if (database.status === 'degraded' ||
            redis.status === 'degraded' ||
            queueStatus === 'degraded' ||
            integrationStatus === 'degraded') {
            return 'degraded';
        }
        return 'ok';
    }
    async checkDatabase(now) {
        const start = process.hrtime.bigint();
        try {
            await this.prisma.$queryRawUnsafe('SELECT 1');
            const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
            return {
                status: 'pass',
                checkedAt: now.toISOString(),
                latencyMs: Number(durationMs.toFixed(3))
            };
        }
        catch (error) {
            globalLogger.error('Database health check failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            return {
                status: 'fail',
                checkedAt: now.toISOString(),
                details: {
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
    async checkRedis(now) {
        if (this.redisProbe) {
            try {
                const start = process.hrtime.bigint();
                await this.redisProbe();
                const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
                return {
                    status: 'pass',
                    checkedAt: now.toISOString(),
                    latencyMs: Number(durationMs.toFixed(3))
                };
            }
            catch (error) {
                globalLogger.error('Redis probe failed', {
                    error: error instanceof Error ? error.message : String(error)
                });
                return {
                    status: 'fail',
                    checkedAt: now.toISOString(),
                    details: {
                        error: error instanceof Error ? error.message : String(error)
                    }
                };
            }
        }
        if (!this.redisUrl) {
            return {
                status: 'degraded',
                checkedAt: now.toISOString(),
                details: {
                    reason: 'REDIS_URL not configured; falling back to in-memory rate limiting'
                }
            };
        }
        const client = (0, redis_1.createClient)({
            url: this.redisUrl,
            socket: {
                connectTimeout: 1000
            }
        });
        client.on('error', (error) => {
            globalLogger.warn('Redis health client error', {
                error: error instanceof Error ? error.message : String(error)
            });
        });
        const start = process.hrtime.bigint();
        try {
            await client.connect();
            await client.ping();
            await client.quit();
            const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
            return {
                status: 'pass',
                checkedAt: now.toISOString(),
                latencyMs: Number(durationMs.toFixed(3))
            };
        }
        catch (error) {
            globalLogger.error('Redis health check failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            try {
                if (client.isOpen) {
                    await client.quit();
                }
            }
            catch {
                // noop
            }
            return {
                status: 'fail',
                checkedAt: now.toISOString(),
                details: {
                    error: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
    async checkQueues(now) {
        const queueModel = this.prisma.cloudTaskMetadata;
        try {
            const records = await queueModel.groupBy({
                by: ['queue'],
                where: {
                    status: {
                        in: QUEUE_ACTIVE_STATUSES
                    }
                },
                _count: {
                    _all: true
                },
                _min: {
                    scheduleTime: true,
                    createdAt: true
                }
            });
            let totalPending = 0;
            const details = [];
            for (const record of records) {
                totalPending += record._count._all;
                const lagSeconds = computeLagSeconds(now, record._min.scheduleTime, record._min.createdAt);
                details.push({
                    queue: record.queue,
                    pending: record._count._all,
                    oldestLagSeconds: lagSeconds
                });
            }
            const status = totalPending > 0 ? 'degraded' : 'pass';
            return {
                status,
                totalPending,
                details: details.sort((a, b) => b.pending - a.pending)
            };
        }
        catch (error) {
            globalLogger.error('Queue health check failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            return {
                status: 'degraded',
                totalPending: 0,
                details: [],
                // degrade if query fails to avoid masking issues
            };
        }
    }
    async checkIntegrations(now) {
        const evaluatedAt = now.toISOString();
        const results = INTEGRATION_DEFINITIONS.map((definition) => {
            const missing = [];
            for (const requirement of definition.required) {
                const rawValue = this.integrationEnv[requirement.key];
                const label = requirement.label ?? requirement.key;
                if (!valueIsPresent(rawValue)) {
                    missing.push(label);
                    continue;
                }
                if (requirement.disallowLocalhostInProduction &&
                    this.integrationEnv.NODE_ENV === 'production' &&
                    isLocalhostUrl(rawValue)) {
                    missing.push(`${label} (localhost is not allowed in production)`);
                }
            }
            const hasMissing = missing.length > 0;
            const status = !hasMissing
                ? 'pass'
                : definition.critical && this.integrationEnv.NODE_ENV === 'production'
                    ? 'fail'
                    : 'degraded';
            return {
                id: definition.id,
                name: definition.name,
                status,
                missingEnv: missing,
                docs: definition.docs
            };
        });
        return {
            status: integrationStatusFromResults(results),
            checkedAt: evaluatedAt,
            results
        };
    }
}
exports.HealthService = HealthService;
exports.healthService = new HealthService();
