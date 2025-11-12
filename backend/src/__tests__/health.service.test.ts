import { HealthService } from '../observability/health/service';

type HealthServiceOptions = ConstructorParameters<typeof HealthService>[0];

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
      now: () => fixedNow
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
      now: () => new Date('2024-01-01T00:00:00Z')
    });

    const readiness = await service.readiness();

    expect(readiness.status).toBe('fail');
    expect(readiness.components.database.status).toBe('fail');
    expect(readiness.components.redis.status).toBe('pass');
  });
});
