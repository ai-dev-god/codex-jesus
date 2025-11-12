import { BiomarkerSource, Prisma, type PrismaClient } from '@prisma/client';

import { BiomarkerService } from '../modules/biomarkers/biomarker.service';

jest.mock('../modules/dashboard/dashboard.service', () => ({
  dashboardService: {
    invalidateUser: jest.fn().mockResolvedValue(undefined)
  }
}));

type MockPrisma = {
  biomarkerLog: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    deleteMany: jest.Mock;
  };
  adminAuditLog: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

const createMockPrisma = (): MockPrisma => {
  const mock: MockPrisma = {
    biomarkerLog: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn()
    },
    adminAuditLog: {
      create: jest.fn()
    },
    $transaction: jest.fn()
  };

  mock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      biomarkerLog: mock.biomarkerLog,
      adminAuditLog: mock.adminAuditLog
    })
  );

  return mock;
};

const createBiomarker = () => ({
  id: 'b1',
  slug: 'hrv',
  name: 'HRV',
  unit: 'ms',
  referenceLow: new Prisma.Decimal(60),
  referenceHigh: new Prisma.Decimal(120),
  source: BiomarkerSource.MANUAL,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-02T00:00:00Z')
});

describe('BiomarkerService manual log safeguards', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('prevents updates to device-imported biomarker logs', async () => {
    const prisma = createMockPrisma();
    const service = new BiomarkerService(prisma as unknown as PrismaClient, () => 'log-uuid');

    prisma.biomarkerLog.findFirst.mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      biomarkerId: 'b1',
      value: new Prisma.Decimal(70),
      unit: 'ms',
      source: BiomarkerSource.WHOOP,
      capturedAt: new Date('2025-01-02T12:00:00Z'),
      accepted: true,
      flagged: false,
      notes: null,
      rawPayload: null,
      createdAt: new Date('2025-01-02T12:00:01Z'),
      updatedAt: new Date('2025-01-02T12:00:01Z'),
      biomarker: createBiomarker()
    });

    await expect(
      service.updateManualLog('user-1', 'log-1', {
        value: 80,
        expectedUpdatedAt: new Date('2025-01-02T12:00:01Z')
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'BIOMARKER_LOG_SOURCE_RESTRICTED'
    });

    expect(prisma.biomarkerLog.updateMany).not.toHaveBeenCalled();
  });

  it('blocks deletion of device-imported biomarker logs', async () => {
    const prisma = createMockPrisma();
    const service = new BiomarkerService(prisma as unknown as PrismaClient, () => 'log-uuid');

    prisma.biomarkerLog.findFirst.mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      biomarkerId: 'b1',
      value: new Prisma.Decimal(70),
      unit: 'ms',
      source: BiomarkerSource.WHOOP,
      capturedAt: new Date('2025-01-02T12:00:00Z'),
      accepted: true,
      flagged: false,
      notes: null,
      rawPayload: null,
      createdAt: new Date('2025-01-02T12:00:01Z'),
      updatedAt: new Date('2025-01-02T12:00:01Z')
    });

    await expect(
      service.deleteManualLog('user-1', 'log-1', new Date('2025-01-02T12:00:01Z'))
    ).rejects.toMatchObject({
      status: 403,
      code: 'BIOMARKER_LOG_SOURCE_RESTRICTED'
    });

    expect(prisma.biomarkerLog.deleteMany).not.toHaveBeenCalled();
  });
});
