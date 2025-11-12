import {
  BiomarkerSource,
  InsightStatus,
  Prisma,
  type PrismaClient,
  WhoopSyncStatus,
  type Biomarker
} from '@prisma/client';

import { DashboardService, type DashboardCacheClient } from '../modules/dashboard/dashboard.service';

type MockPrisma = {
  biomarker: {
    findMany: jest.Mock;
  };
  biomarkerLog: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  insight: {
    findFirst: jest.Mock;
  };
  whoopIntegration: {
    findUnique: jest.Mock;
  };
};

class MockCache implements DashboardCacheClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  get = jest.fn(async (key: string) => {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  });

  set = jest.fn(async (key: string, value: string, ttlSeconds: number) => {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  });

  del = jest.fn(async (key: string) => {
    this.store.delete(key);
  });
}

const baseNow = new Date('2025-01-03T00:00:00.000Z');

const createMockPrisma = (): MockPrisma => ({
  biomarker: {
    findMany: jest.fn()
  },
  biomarkerLog: {
    findMany: jest.fn(),
    findFirst: jest.fn()
  },
  insight: {
    findFirst: jest.fn()
  },
  whoopIntegration: {
    findUnique: jest.fn()
  }
});

const toDecimal = (value: number) => new Prisma.Decimal(value);

const createBiomarker = (overrides: Partial<Biomarker> & { id: string; slug: string }): Biomarker => ({
  id: overrides.id,
  slug: overrides.slug,
  name: overrides.name ?? overrides.slug,
  unit: overrides.unit ?? 'unit',
  referenceLow: overrides.referenceLow ?? null,
  referenceHigh: overrides.referenceHigh ?? null,
  source: overrides.source ?? BiomarkerSource.MANUAL,
  createdAt: overrides.createdAt ?? baseNow,
  updatedAt: overrides.updatedAt ?? baseNow
});

describe('DashboardService', () => {
  let prisma: MockPrisma;
  let cache: MockCache;
  let service: DashboardService;

  beforeEach(() => {
    prisma = createMockPrisma();
    cache = new MockCache();
    service = new DashboardService(prisma as unknown as PrismaClient, cache, {
      now: () => baseNow,
      cacheKeyPrefix: 'dashboard',
      cacheTtlSeconds: 300,
      snapshotTtlSeconds: 900,
      trendWindowDays: 7
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('computes summary with biomarker trends, action items, and caches the result', async () => {
    const hrv = createBiomarker({
      id: 'b-hrv',
      slug: 'hrv',
      name: 'Heart Rate Variability',
      unit: 'ms',
      referenceLow: toDecimal(60),
      referenceHigh: toDecimal(120)
    });
    const rhr = createBiomarker({
      id: 'b-rhr',
      slug: 'resting-heart-rate',
      name: 'Resting Heart Rate',
      unit: 'bpm',
      referenceLow: toDecimal(50),
      referenceHigh: toDecimal(65)
    });

    prisma.biomarker.findMany.mockResolvedValue([hrv, rhr]);
    prisma.biomarkerLog.findMany.mockResolvedValue([
      {
        id: 'log-hrv-prev',
        userId: 'user-1',
        biomarkerId: hrv.id,
        value: toDecimal(72),
        unit: 'ms',
        source: BiomarkerSource.MANUAL,
        capturedAt: new Date('2024-12-26T00:00:00.000Z'),
        accepted: true,
        flagged: false,
        notes: null,
        createdAt: new Date('2024-12-26T00:00:00.000Z'),
        updatedAt: new Date('2024-12-26T00:00:00.000Z'),
        biomarker: hrv
      },
      {
        id: 'log-hrv-recent',
        userId: 'user-1',
        biomarkerId: hrv.id,
        value: toDecimal(82),
        unit: 'ms',
        source: BiomarkerSource.MANUAL,
        capturedAt: new Date('2025-01-02T00:00:00.000Z'),
        accepted: true,
        flagged: false,
        notes: null,
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
        biomarker: hrv
      },
      {
        id: 'log-rhr-prev',
        userId: 'user-1',
        biomarkerId: rhr.id,
        value: toDecimal(63),
        unit: 'bpm',
        source: BiomarkerSource.MANUAL,
        capturedAt: new Date('2024-12-27T00:00:00.000Z'),
        accepted: true,
        flagged: false,
        notes: null,
        createdAt: new Date('2024-12-27T00:00:00.000Z'),
        updatedAt: new Date('2024-12-27T00:00:00.000Z'),
        biomarker: rhr
      },
      {
        id: 'log-rhr-recent',
        userId: 'user-1',
        biomarkerId: rhr.id,
        value: toDecimal(57),
        unit: 'bpm',
        source: BiomarkerSource.MANUAL,
        capturedAt: new Date('2025-01-02T12:00:00.000Z'),
        accepted: true,
        flagged: false,
        notes: null,
        createdAt: new Date('2025-01-02T12:00:00.000Z'),
        updatedAt: new Date('2025-01-02T12:00:00.000Z'),
        biomarker: rhr
      }
    ]);

    prisma.insight.findFirst.mockResolvedValue({
      id: 'insight-1',
      userId: 'user-1',
      title: 'Recovery trending up',
      summary: 'HRV improving week over week.',
      body: { insights: ['trend'], recommendations: ['hydrate'] },
      status: InsightStatus.DELIVERED,
      modelUsed: 'model',
      generatedAt: new Date('2025-01-02T08:00:00.000Z'),
      promptMetadata: { windowDays: 7 },
      createdAt: new Date('2025-01-02T08:00:00.000Z'),
      updatedAt: new Date('2025-01-02T08:00:00.000Z')
    });

    prisma.whoopIntegration.findUnique.mockResolvedValue({
      id: 'integration-1',
      userId: 'user-1',
      whoopUserId: 'whoop-1',
      accessToken: 'enc',
      refreshToken: 'enc',
      expiresAt: new Date('2025-01-10T00:00:00.000Z'),
      scope: ['read'],
      tokenKeyId: 'key',
      tokenRotatedAt: new Date('2025-01-01T00:00:00.000Z'),
      syncStatus: WhoopSyncStatus.ACTIVE,
      lastSyncedAt: new Date('2025-01-02T22:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-02T22:00:00.000Z'),
      accessTokenIv: null,
      refreshTokenIv: null
    });

    const summary = await service.getSummary('user-1');

    expect(summary.cacheState).toBe('MISS');
    expect(summary.generatedAt).toBe(baseNow.toISOString());
    expect(summary.readinessScore).toBeGreaterThan(0);
    expect(summary.strainScore).toBeGreaterThan(0);
    expect(summary.sleepScore).toBeNull();
    expect(summary.todaysInsight).toMatchObject({ id: 'insight-1', status: InsightStatus.DELIVERED });
    expect(summary.biomarkerTrends).toBeDefined();
    const trends = summary.biomarkerTrends;
    expect(trends).toHaveLength(2);
    expect(trends[0]).toHaveProperty('direction');
    expect(summary.actionItems.length).toBeGreaterThan(0);
    expect(summary.tiles.length).toBeGreaterThan(0);
    expect(summary.emptyStates).toEqual(
      expect.objectContaining({
        needsBiomarkerLogs: false,
        needsInsight: false,
        needsWhoopLink: false
      })
    );
    expect(cache.set).toHaveBeenCalledWith('dashboard:user-1', expect.any(String), 300);
    expect(prisma.biomarkerLog.findFirst).not.toHaveBeenCalled();
  });

  it('returns cached summary without hitting the database', async () => {
    const cached = {
      readinessScore: 80,
      strainScore: 40,
      sleepScore: null,
      latestWhoopSyncAt: null,
      todaysInsight: null,
      biomarkerTrends: [],
      actionItems: [],
      tiles: [],
      emptyStates: {
        needsBiomarkerLogs: true,
        needsInsight: true,
        needsWhoopLink: true
      },
      generatedAt: baseNow.toISOString(),
      cacheState: 'HIT'
    };

    cache.get.mockResolvedValueOnce(JSON.stringify(cached));

    const summary = await service.getSummary('user-1');

    expect(summary).toEqual(cached);
    expect(prisma.biomarkerLog.findMany).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not request biomarker empty state when only historical logs exist', async () => {
    prisma.biomarker.findMany.mockResolvedValue([]);
    prisma.biomarkerLog.findMany.mockResolvedValue([]);
    prisma.biomarkerLog.findFirst.mockResolvedValue({ id: 'log-old' });
    prisma.insight.findFirst.mockResolvedValue(null);
    prisma.whoopIntegration.findUnique.mockResolvedValue(null);

    const summary = await service.getSummary('user-2');

    expect(summary.emptyStates.needsBiomarkerLogs).toBe(false);
    expect(summary.actionItems.some((item) => item.id === 'log-biomarker')).toBe(false);
    expect(cache.set).toHaveBeenCalledWith('dashboard:user-2', expect.any(String), 300);
    expect(prisma.biomarkerLog.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-2' },
      select: { id: true }
    });
  });

  it('provides an offline snapshot with expiry and reuses the summary', async () => {
    prisma.biomarker.findMany.mockResolvedValue([]);
    prisma.biomarkerLog.findMany.mockResolvedValue([]);
    prisma.biomarkerLog.findFirst.mockResolvedValue(null);
    prisma.insight.findFirst.mockResolvedValue(null);
    prisma.whoopIntegration.findUnique.mockResolvedValue(null);

    const snapshot = await service.getOfflineSnapshot('user-1');

    expect(snapshot.version).toBe(1);
    expect(snapshot.generatedAt).toBe(baseNow.toISOString());
    expect(snapshot.summary.generatedAt).toBe(baseNow.toISOString());
    expect(snapshot.summary.cacheState).toBe('MISS');
    expect(snapshot.expiresAt).toBe(new Date(baseNow.getTime() + 900 * 1000).toISOString());
  });

  it('invalidates cache entries on demand', async () => {
    await service.invalidateUser('user-1');
    expect(cache.del).toHaveBeenCalledWith('dashboard:user-1');
  });
});
