import type { PrismaClient } from '@prisma/client';

import { PanelIngestionService } from '../modules/ai/panel-ingest.service';
import { HttpError } from '../modules/observability-ops/http-error';

type MockPrisma = {
  panelUpload: {
    create: jest.Mock;
    findUnique: jest.Mock;
  };
  biomarkerMeasurement: {
    create: jest.Mock;
  };
  panelUploadSession: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  cloudTaskMetadata: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

const baseDate = new Date('2025-01-01T00:00:00.000Z');

const createMockPrisma = (): MockPrisma => {
  const mock = {
    panelUpload: {
      create: jest.fn(),
      findUnique: jest.fn()
    },
    biomarkerMeasurement: {
      create: jest.fn()
    },
    panelUploadSession: {
      findFirst: jest.fn(),
      update: jest.fn()
    },
    cloudTaskMetadata: {
      create: jest.fn()
    },
    $transaction: jest.fn()
  };

  mock.$transaction.mockImplementation(async (callback: (tx: PrismaClient) => Promise<unknown>) => {
    const tx = {
      panelUpload: mock.panelUpload,
      biomarkerMeasurement: mock.biomarkerMeasurement,
      panelUploadSession: mock.panelUploadSession,
      cloudTaskMetadata: mock.cloudTaskMetadata
    } as unknown as PrismaClient;
    return callback(tx);
  });

  return mock;
};

const createService = (prisma: MockPrisma) =>
  new PanelIngestionService(prisma as unknown as PrismaClient, {
    now: () => baseDate
  });

describe('PanelIngestionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates uploads and biomarker measurements from normalized payload', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.panelUploadSession.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      storageKey: 's3://panel.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
      sha256Hash: 'a'.repeat(64),
      status: 'PENDING',
      expiresAt: new Date('2025-01-02T00:00:00.000Z')
    });
    prisma.panelUpload.create.mockResolvedValue({
      id: 'upload-1',
      userId: 'user-1',
      storageKey: 's3://panel.pdf',
      status: 'NORMALIZED',
      source: 'LAB_REPORT',
      contentType: 'application/pdf',
      pageCount: 2,
      rawMetadata: null,
      normalizedPayload: null,
      measurementCount: 2,
      processedAt: baseDate,
      errorCode: null,
      errorMessage: null,
      createdAt: baseDate,
      updatedAt: baseDate
    });
    prisma.biomarkerMeasurement.create.mockResolvedValue({
      id: 'measurement-1',
      userId: 'user-1',
      markerName: 'ApoB',
      biomarkerId: null,
      panelUploadId: 'upload-1',
      value: null,
      unit: 'mg/dL',
      referenceLow: null,
      referenceHigh: null,
      capturedAt: baseDate,
      status: 'NORMALIZED',
      source: 'LAB_UPLOAD',
      confidence: null,
      flags: null,
      createdAt: baseDate,
      updatedAt: baseDate
    });
    prisma.panelUpload.findUnique.mockResolvedValue({
      id: 'upload-1',
      userId: 'user-1',
      storageKey: 's3://panel.pdf',
      status: 'NORMALIZED',
      source: 'LAB_REPORT',
      contentType: 'application/pdf',
      pageCount: 2,
      rawMetadata: null,
      normalizedPayload: null,
      measurementCount: 2,
      processedAt: baseDate,
      errorCode: null,
      errorMessage: null,
      createdAt: baseDate,
      updatedAt: baseDate,
      measurements: []
    });

    prisma.panelUploadSession.update.mockResolvedValue({});

    await service.recordUpload('user-1', {
      sessionId: 'session-1',
      storageKey: 's3://panel.pdf',
      measurements: [
        {
          markerName: 'ApoB',
          value: 105,
          unit: 'mg/dL'
        }
      ]
    });

    expect(prisma.panelUpload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          measurementCount: 1,
          status: 'NORMALIZED'
        })
      })
    );
    expect(prisma.biomarkerMeasurement.create).toHaveBeenCalled();
    expect(prisma.panelUpload.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'upload-1' }
      })
    );
  });

  it('wraps unknown errors in HttpError', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.panelUploadSession.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      storageKey: 's3://panel.pdf',
      contentType: 'application/pdf',
      byteSize: 1,
      sha256Hash: 'a'.repeat(64),
      status: 'PENDING',
      expiresAt: new Date('2025-01-02T00:00:00.000Z')
    });
    prisma.panelUpload.create.mockRejectedValue(new Error('s3 unavailable'));
    prisma.panelUploadSession.update.mockResolvedValue({});

    await expect(
      service.recordUpload('user-1', {
        sessionId: 'session-1',
        storageKey: 's3://panel.pdf'
      })
    ).rejects.toBeInstanceOf(HttpError);
  });
});

