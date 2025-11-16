import type { PrismaClient } from '@prisma/client';

import { LongevityStackService } from '../modules/ai/longevity-stack.service';

describe('LongevityStackService', () => {
  const prisma = {
    biomarkerMeasurement: {
      findMany: jest.fn()
    }
  } as unknown as PrismaClient;

  const service = new LongevityStackService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives stacks with biomarker deltas', async () => {
    const now = new Date();
    (prisma.biomarkerMeasurement.findMany as jest.Mock).mockResolvedValue([
      { markerName: 'Glucose', value: 92, capturedAt: now, panelUploadId: 'upload-2', userId: 'user-1' },
      {
        markerName: 'Glucose',
        value: 104,
        capturedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        panelUploadId: 'upload-1',
        userId: 'user-1'
      },
      { markerName: 'ApoB', value: 85, capturedAt: now, panelUploadId: 'upload-2', userId: 'user-1' },
      {
        markerName: 'ApoB',
        value: 95,
        capturedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        panelUploadId: 'upload-1',
        userId: 'user-1'
      }
    ]);

    const stacks = await service.computeStacks('user-1');

    const metabolicStack = stacks.find((stack) => stack.focusArea === 'metabolic');
    expect(metabolicStack).toBeDefined();
    expect(metabolicStack?.keyBiomarkers.length).toBeGreaterThan(0);
  });
});

