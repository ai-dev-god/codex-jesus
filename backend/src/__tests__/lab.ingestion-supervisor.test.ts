import type { PrismaClient } from '@prisma/client';

import { LabIngestionSupervisor } from '../modules/lab-upload/ingestion-supervisor';

describe('LabIngestionSupervisor', () => {
  const mockPrisma = {
    biomarker: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'bm-glucose', name: 'Glucose', unit: 'mg/dL', slug: 'glucose' },
        { id: 'bm-apob', name: 'ApoB', unit: 'mg/dL', slug: 'apob' }
      ])
    }
  } as unknown as PrismaClient;

  it('extracts biomarker-like lines with mapped IDs', async () => {
    const supervisor = new LabIngestionSupervisor(mockPrisma);
    const sampleText = `
      Glucose 92 mg/dL
      ApoB 110 mg/dL
      Random Text line
    `;

    const result = await supervisor.supervise(sampleText);

    expect(result.measurements).toHaveLength(2);
    expect(result.measurements[0]).toMatchObject({
      markerName: 'Glucose',
      biomarkerId: 'bm-glucose',
      unit: 'mg/dL'
    });
    expect(result.notes).toHaveLength(0);
  });

  it('annotates low-confidence entries when biomarker is unknown', async () => {
    const supervisor = new LabIngestionSupervisor(mockPrisma);
    const sampleText = `NovelMarker 12 ug/L`;

    const result = await supervisor.supervise(sampleText);

    expect(result.measurements).toHaveLength(1);
    expect(result.measurements[0].biomarkerId).toBeUndefined();
    expect(result.notes[0]).toMatch(/Unmapped biomarker/i);
  });
});

