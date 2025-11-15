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
        const [database, redis, queues] = await Promise.all([
            this.checkDatabase(now),
            this.checkRedis(now),
            this.checkQueues(now)
        ]);
        const status = this.overallStatus(database, redis, queues.status);
        return {
            status,
            checkedAt: now.toISOString(),
            components: {
                database,
                redis,
                queues,
                metrics: (0, metrics_1.getMetricsSnapshot)()
            }
        };
    }
    overallStatus(database, redis, queueStatus) {
        if (database.status === 'fail' || redis.status === 'fail') {
            return 'fail';
        }
        if (database.status === 'degraded' || redis.status === 'degraded' || queueStatus === 'degraded') {
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
}
exports.HealthService = HealthService;
exports.healthService = new HealthService();
