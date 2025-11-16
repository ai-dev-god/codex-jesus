import type { PrismaClient } from '@prisma/client';

import { LabReportService } from '../modules/lab-upload/lab-report.service';

describe('LabReportService', () => {
  const now = new Date('2025-11-16T12:00:00.000Z');
  const prisma = {
    panelUpload: {
      findFirst: jest.fn()
    },
    biomarkerMeasurement: {
      findMany: jest.fn()
    }
  } as unknown as PrismaClient;

  const service = new LabReportService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds report payload with best-practice notes', async () => {
    (prisma.panelUpload.findFirst as jest.Mock).mockResolvedValue({
      id: 'upload-1',
      userId: 'user-1',
      storageKey: 'labs/user-1/panel.pdf',
      createdAt: now,
      rawMetadata: { fileName: 'Metabolic Panel.pdf' },
      plan: { id: 'plan-1', title: 'Metabolic Reset', focusAreas: ['metabolic'] },
      measurements: [
        {
          id: 'm-1',
          markerName: 'Glucose',
          value: 92,
          unit: 'mg/dL',
          capturedAt: now,
          userId: 'user-1'
        }
      ]
    });

    (prisma.biomarkerMeasurement.findMany as jest.Mock).mockResolvedValue([
      {
        markerName: 'Glucose',
        value: 110,
        capturedAt: new Date('2025-10-01T12:00:00.000Z')
      }
    ]);

    const report = await service.buildReport('user-1', 'upload-1');

    expect(report.measurements).toHaveLength(1);
    expect(report.bestPractices.length).toBeGreaterThan(0);
  });
});

