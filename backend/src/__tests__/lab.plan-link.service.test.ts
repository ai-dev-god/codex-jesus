import type { PrismaClient } from '@prisma/client';

import { LabPlanLinkService } from '../modules/lab-upload/plan-link.service';

describe('LabPlanLinkService', () => {
  const prisma = {
    panelUpload: {
      update: jest.fn()
    },
    longevityPlan: {
      findMany: jest.fn(),
      update: jest.fn()
    }
  } as unknown as PrismaClient;

  const service = new LabPlanLinkService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('links upload to the best matching plan based on focus areas', async () => {
    (prisma.longevityPlan.findMany as jest.Mock).mockResolvedValue([
      { id: 'plan-metabolic', userId: 'user-1', focusAreas: ['metabolic'], evidence: [] },
      { id: 'plan-cardio', userId: 'user-1', focusAreas: ['cardiovascular'], evidence: [] }
    ]);

    await service.autoLink('upload-1', 'user-1', [{ markerName: 'Glucose' }]);

    expect(prisma.panelUpload.update).toHaveBeenCalledWith({
      where: { id: 'upload-1' },
      data: { planId: 'plan-metabolic' }
    });
    expect(prisma.longevityPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-metabolic' }
      })
    );
  });
});

