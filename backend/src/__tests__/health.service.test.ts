import { HealthService } from '../observability/health/service';

type HealthServiceOptions = ConstructorParameters<typeof HealthService>[0];

const healthyIntegrationEnv = {
  NODE_ENV: 'production' as const,
  STRAVA_CLIENT_ID: 'strava-client',
  STRAVA_CLIENT_SECRET: 'strava-secret',
  STRAVA_REDIRECT_URI: 'https://app.example.com/oauth/strava/callback',
  WHOOP_CLIENT_ID: 'whoop-client',
  WHOOP_CLIENT_SECRET: 'whoop-secret',
  WHOOP_REDIRECT_URI: 'https://app.example.com/oauth/whoop/callback',
  RESEND_API_KEY: 'resend-key',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret'
};

const createIntegrationEnv = (
  overrides: Partial<typeof healthyIntegrationEnv> = {}
): NonNullable<HealthServiceOptions>['integrationEnv'] => ({
  ...healthyIntegrationEnv,
  ...overrides
});

describe('HealthService', () => {
  it('aggregates readiness status across components', async () => {
    const fixedNow = new Date('2024-01-01T00:00:00.000Z');

    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue(1),
      cloudTaskMetadata: {
        groupBy: jest.fn().mockResolvedValue([
          {
            queue: 'insights-generate',
            _count: { _all: 2 },
            _min: {
              scheduleTime: new Date(fixedNow.getTime() - 5_000),
              createdAt: new Date(fixedNow.getTime() - 10_000)
            }
          }
        ])
      }
    };

    const redisProbe = jest.fn().mockResolvedValue(undefined);
    const service = new HealthService({
      prisma: prisma as unknown as NonNullable<HealthServiceOptions>['prisma'],
      redisProbe,
      now: () => fixedNow,
      integrationEnv: createIntegrationEnv()
    });

    const readiness = await service.readiness();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    expect(redisProbe).toHaveBeenCalled();
    expect(readiness.status).toBe('degraded');
    expect(readiness.components.database.status).toBe('pass');
    expect(readiness.components.redis.status).toBe('pass');
    expect(readiness.components.queues.status).toBe('degraded');
    expect(readiness.components.queues.details).toEqual([
      expect.objectContaining({
        queue: 'insights-generate',
        pending: 2
      })
    ]);
    expect(readiness.components.integrations.status).toBe('pass');
    expect(readiness.components.integrations.results.every((result) => result.status === 'pass')).toBe(true);
    expect(readiness.components.metrics.http).toBeInstanceOf(Array);
  });

  it('reports failure when the database probe throws', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('db down')),
      cloudTaskMetadata: {
        groupBy: jest.fn().mockResolvedValue([])
      }
    };

    const service = new HealthService({
      prisma: prisma as unknown as NonNullable<HealthServiceOptions>['prisma'],
      redisProbe: jest.fn().mockResolvedValue(undefined),
      now: () => new Date('2024-01-01T00:00:00Z'),
      integrationEnv: createIntegrationEnv()
    });

    const readiness = await service.readiness();

    expect(readiness.status).toBe('fail');
    expect(readiness.components.database.status).toBe('fail');
    expect(readiness.components.redis.status).toBe('pass');
  });

  it('fails readiness when critical integrations are missing in production', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue(1),
      cloudTaskMetadata: {
        groupBy: jest.fn().mockResolvedValue([])
      }
    };

    const service = new HealthService({
      prisma: prisma as unknown as NonNullable<HealthServiceOptions>['prisma'],
      redisProbe: jest.fn().mockResolvedValue(undefined),
      now: () => new Date('2024-01-01T00:00:00Z'),
      integrationEnv: createIntegrationEnv({
        STRAVA_CLIENT_ID: undefined,
        STRAVA_CLIENT_SECRET: undefined
      })
    });

    const readiness = await service.readiness();
    const stravaStatus = readiness.components.integrations.results.find((result) => result.id === 'strava');

    expect(readiness.status).toBe('fail');
    expect(readiness.components.integrations.status).toBe('fail');
    expect(stravaStatus?.status).toBe('fail');
    expect(stravaStatus?.missingEnv).toEqual(expect.arrayContaining(['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET']));
  });
});
