import type { PrismaClient } from '@prisma/client';

import { EarlyWarningService } from '../modules/ai/early-warning.service';

describe('EarlyWarningService', () => {
  const prisma = {
    biomarkerMeasurement: {
      findMany: jest.fn()
    }
  } as unknown as PrismaClient;

  const service = new EarlyWarningService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns warnings when thresholds are crossed', async () => {
    (prisma.biomarkerMeasurement.findMany as jest.Mock).mockResolvedValue([
      { markerName: 'glucose', value: 110, unit: 'mg/dL', capturedAt: new Date() },
      { markerName: 'crp', value: 1.2, unit: 'mg/L', capturedAt: new Date() }
    ]);

    const warnings = await service.detect('user-1');

    expect(warnings.length).toBe(1);
    expect(warnings[0].markerName.toLowerCase()).toBe('glucose');
  });
});

