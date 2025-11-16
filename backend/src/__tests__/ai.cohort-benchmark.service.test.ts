import type { PrismaClient } from '@prisma/client';

import { CohortBenchmarkService } from '../modules/ai/cohort-benchmark.service';

describe('CohortBenchmarkService', () => {
  const prisma = {
    biomarkerMeasurement: {
      findMany: jest.fn(),
      groupBy: jest.fn()
    }
  } as unknown as PrismaClient;

  const service = new CohortBenchmarkService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds benchmarks with percentiles', async () => {
    (prisma.biomarkerMeasurement.findMany as jest.Mock).mockResolvedValue([
      { markerName: 'glucose', value: 92, capturedAt: new Date() },
      { markerName: 'apob', value: 85, capturedAt: new Date() }
    ]);

    (prisma.biomarkerMeasurement.groupBy as jest.Mock).mockResolvedValue([
      { markerName: 'glucose', _avg: { value: 100 }, _count: { _all: 150 } },
      { markerName: 'apob', _avg: { value: 90 }, _count: { _all: 150 } }
    ]);

    const benchmarks = await service.compute('user-1');

    expect(benchmarks.length).toBeGreaterThan(0);
    expect(benchmarks[0].cohortSampleSize).toBeGreaterThan(0);
  });
});

