import type { CloudTaskStatus, PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { getMetricsSnapshot, type MetricsSnapshot } from '../metrics';
import { baseLogger } from '../logger';

type PrismaDependency = Pick<PrismaClient, '$queryRawUnsafe' | 'cloudTaskMetadata'>;
type CloudTaskModel = PrismaDependency['cloudTaskMetadata'];

type ComponentStatus = {
  status: 'pass' | 'fail' | 'degraded';
  checkedAt: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
};

type QueueDetails = {
  queue: string;
  pending: number;
  oldestLagSeconds: number | null;
};

export type ReadinessSnapshot = {
  status: 'ok' | 'degraded' | 'fail';
  checkedAt: string;
  components: {
    database: ComponentStatus;
    redis: ComponentStatus;
    queues: {
      status: 'pass' | 'degraded';
      totalPending: number;
      details: QueueDetails[];
    };
    metrics: MetricsSnapshot;
  };
};

export type LivenessSnapshot = {
  status: 'ok';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
};

type HealthServiceOptions = {
  prisma?: PrismaDependency;
  redisProbe?: () => Promise<void>;
  redisUrl?: string;
  now?: () => Date;
};

const QUEUE_ACTIVE_STATUSES: CloudTaskStatus[] = ['PENDING', 'DISPATCHED'];

const computeLagSeconds = (now: Date, ...timestamps: (Date | null)[]): number | null => {
  const reference = timestamps.filter((value) => value instanceof Date).reduce<Date | null>((earliest, current) => {
    if (!earliest) {
      return current as Date;
    }
    return current && current < earliest ? (current as Date) : earliest;
  }, null);

  if (!reference) {
    return null;
  }

  const diffMs = now.getTime() - reference.getTime();
  return diffMs <= 0 ? 0 : Number((diffMs / 1000).toFixed(3));
};

const globalLogger = baseLogger.with({ component: 'health' });

export class HealthService {
  private readonly prisma: PrismaDependency;
  private readonly redisProbe?: () => Promise<void>;
  private readonly redisUrl?: string;
  private readonly now: () => Date;

  constructor(options: HealthServiceOptions = {}) {
    this.prisma = options.prisma ?? prismaClient;
    this.redisProbe = options.redisProbe;
    this.redisUrl = options.redisUrl ?? env.REDIS_URL;
    this.now = options.now ?? (() => new Date());
  }

  async liveness(): Promise<LivenessSnapshot> {
    const now = this.now();

    return {
      status: 'ok',
      service: 'biohax-backend',
      timestamp: now.toISOString(),
      uptimeSeconds: Math.round(process.uptime())
    };
  }

  async readiness(): Promise<ReadinessSnapshot> {
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
        metrics: getMetricsSnapshot()
      }
    };
  }

  private overallStatus(
    database: ComponentStatus,
    redis: ComponentStatus,
    queueStatus: 'pass' | 'degraded'
  ): ReadinessSnapshot['status'] {
    if (database.status === 'fail' || redis.status === 'fail') {
      return 'fail';
    }

    if (database.status === 'degraded' || redis.status === 'degraded' || queueStatus === 'degraded') {
      return 'degraded';
    }

    return 'ok';
  }

  private async checkDatabase(now: Date): Promise<ComponentStatus> {
    const start = process.hrtime.bigint();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      return {
        status: 'pass',
        checkedAt: now.toISOString(),
        latencyMs: Number(durationMs.toFixed(3))
      };
    } catch (error) {
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

  private async checkRedis(now: Date): Promise<ComponentStatus> {
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
      } catch (error) {
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

    const client = createClient({
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
    } catch (error) {
      globalLogger.error('Redis health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch {
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

  private async checkQueues(now: Date): Promise<ReadinessSnapshot['components']['queues']> {
    const queueModel: CloudTaskModel = this.prisma.cloudTaskMetadata;

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
      const details: QueueDetails[] = [];
      for (const record of records) {
        totalPending += record._count._all;
        const lagSeconds = computeLagSeconds(now, record._min.scheduleTime, record._min.createdAt);
        details.push({
          queue: record.queue,
          pending: record._count._all,
          oldestLagSeconds: lagSeconds
        });
      }

      const status: 'pass' | 'degraded' = totalPending > 0 ? 'degraded' : 'pass';

      return {
        status,
        totalPending,
        details: details.sort((a, b) => b.pending - a.pending)
      };
    } catch (error) {
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

export const healthService = new HealthService();
