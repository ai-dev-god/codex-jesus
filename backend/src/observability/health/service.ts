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
    integrations: IntegrationsComponent;
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
  integrationEnv?: Partial<IntegrationEnv>;
};

type IntegrationStatus = 'pass' | 'degraded' | 'fail';

type IntegrationResult = {
  id: IntegrationId;
  name: string;
  status: IntegrationStatus;
  missingEnv: string[];
  docs?: string;
};

type IntegrationsComponent = {
  status: IntegrationStatus;
  checkedAt: string;
  results: IntegrationResult[];
};

type IntegrationEnv = Pick<
  typeof env,
  | 'NODE_ENV'
  | 'STRAVA_CLIENT_ID'
  | 'STRAVA_CLIENT_SECRET'
  | 'STRAVA_REDIRECT_URI'
  | 'WHOOP_CLIENT_ID'
  | 'WHOOP_CLIENT_SECRET'
  | 'WHOOP_REDIRECT_URI'
  | 'RESEND_API_KEY'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
>;

type IntegrationId = 'strava' | 'whoop' | 'google-oauth' | 'resend';

type IntegrationRequirement = {
  key: Exclude<keyof IntegrationEnv, 'NODE_ENV'>;
  label?: string;
  disallowLocalhostInProduction?: boolean;
};

type IntegrationDefinition = {
  id: IntegrationId;
  name: string;
  required: IntegrationRequirement[];
  docs?: string;
  critical?: boolean;
};

const defaultIntegrationEnv: IntegrationEnv = {
  NODE_ENV: env.NODE_ENV,
  STRAVA_CLIENT_ID: env.STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET: env.STRAVA_CLIENT_SECRET,
  STRAVA_REDIRECT_URI: env.STRAVA_REDIRECT_URI,
  WHOOP_CLIENT_ID: env.WHOOP_CLIENT_ID,
  WHOOP_CLIENT_SECRET: env.WHOOP_CLIENT_SECRET,
  WHOOP_REDIRECT_URI: env.WHOOP_REDIRECT_URI,
  RESEND_API_KEY: env.RESEND_API_KEY,
  GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET
};

const buildIntegrationEnv = (overrides?: Partial<IntegrationEnv>): IntegrationEnv => ({
  ...defaultIntegrationEnv,
  ...overrides
});

const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
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

const integrationStatusFromResults = (results: IntegrationResult[]): IntegrationStatus => {
  if (results.some((result) => result.status === 'fail')) {
    return 'fail';
  }
  if (results.some((result) => result.status === 'degraded')) {
    return 'degraded';
  }
  return 'pass';
};

const valueIsPresent = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isLocalhostUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
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
  private readonly integrationEnv: IntegrationEnv;

  constructor(options: HealthServiceOptions = {}) {
    this.prisma = options.prisma ?? prismaClient;
    this.redisProbe = options.redisProbe;
    this.redisUrl = options.redisUrl ?? env.REDIS_URL;
    this.now = options.now ?? (() => new Date());
    this.integrationEnv = buildIntegrationEnv(options.integrationEnv);
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
        metrics: getMetricsSnapshot()
      }
    };
  }

  private overallStatus(
    database: ComponentStatus,
    redis: ComponentStatus,
    queueStatus: 'pass' | 'degraded',
    integrationStatus: IntegrationsComponent['status']
  ): ReadinessSnapshot['status'] {
    if (database.status === 'fail' || redis.status === 'fail' || integrationStatus === 'fail') {
      return 'fail';
    }

    if (
      database.status === 'degraded' ||
      redis.status === 'degraded' ||
      queueStatus === 'degraded' ||
      integrationStatus === 'degraded'
    ) {
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

  private async checkIntegrations(now: Date): Promise<IntegrationsComponent> {
    const evaluatedAt = now.toISOString();
    const results: IntegrationResult[] = INTEGRATION_DEFINITIONS.map((definition) => {
      const missing: string[] = [];

      for (const requirement of definition.required) {
        const rawValue = this.integrationEnv[requirement.key];
        const label = requirement.label ?? requirement.key;
        if (!valueIsPresent(rawValue)) {
          missing.push(label);
          continue;
        }

        if (
          requirement.disallowLocalhostInProduction &&
          this.integrationEnv.NODE_ENV === 'production' &&
          isLocalhostUrl(rawValue)
        ) {
          missing.push(`${label} (localhost is not allowed in production)`);
        }
      }

      const hasMissing = missing.length > 0;
      const status: IntegrationStatus =
        !hasMissing
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

export const healthService = new HealthService();
