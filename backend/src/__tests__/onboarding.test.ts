import type { Prisma, PrismaClient, Profile } from '@prisma/client';
import { Role, UserStatus } from '@prisma/client';

import { OnboardingService } from '../modules/onboarding/onboarding.service';
import { HttpError } from '../modules/observability-ops/http-error';
import { dataSubjectService } from '../modules/data-subject/data-subject.service';

jest.mock('../modules/data-subject/data-subject.service', () => ({
  dataSubjectService: {
    requestExport: jest.fn(),
    getExportJob: jest.fn(),
    getLatestExportJob: jest.fn(),
    requestDeletion: jest.fn(),
    getDeletionJob: jest.fn(),
    getLatestDeletionJob: jest.fn()
  }
}));

const mockedDataSubjectService = dataSubjectService as jest.Mocked<typeof dataSubjectService>;

type MockPrisma = {
  profile: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  user: {
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

const createMockPrisma = (): MockPrisma => {
  const mock: MockPrisma = {
    profile: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    user: {
      update: jest.fn()
    },
    $transaction: jest.fn()
  };

  mock.$transaction.mockImplementation(async (callback: (tx: MockPrisma) => Promise<unknown>) => callback(mock));

  return mock;
};

const toJsonValue = <T>(value: T): Prisma.JsonValue => JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;

const createProfileRecord = (overrides: Partial<Profile> = {}): Profile => {
  const now = new Date();
  return {
    id: 'profile-123',
    userId: 'user-123',
    displayName: 'BioHax Member',
    timezone: 'UTC',
    baselineSurvey: null,
    consents: toJsonValue([]),
    onboardingCompletedAt: null,
    deleteRequested: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
};

describe('OnboardingService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('rejects invalid timezone when updating profile', async () => {
    const prisma = createMockPrisma();
    const service = new OnboardingService(prisma as unknown as PrismaClient);

    prisma.profile.findUnique.mockResolvedValue(createProfileRecord());

    await expect(
      service.updateProfile('user-123', {
        timezone: 'Mars/Colony'
      })
    ).rejects.toBeInstanceOf(HttpError);

    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it('marks onboarding complete when baseline and required consents are present', async () => {
    const prisma = createMockPrisma();
    const service = new OnboardingService(prisma as unknown as PrismaClient, () => 'export-123');
    const existing = createProfileRecord();

    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T12:00:00.000Z'));

    prisma.profile.findUnique.mockResolvedValue(existing);
    prisma.user.update.mockResolvedValue({
      id: 'user-123',
      email: 'member@example.com',
      role: Role.MEMBER,
      status: UserStatus.ACTIVE
    });
    prisma.profile.update.mockResolvedValue(
      createProfileRecord({
        baselineSurvey: toJsonValue({ trainingLoad: 'moderate' }),
        consents: toJsonValue([
          { type: 'TERMS_OF_SERVICE', granted: true, grantedAt: new Date().toISOString(), metadata: null },
          { type: 'PRIVACY_POLICY', granted: true, grantedAt: new Date().toISOString(), metadata: null },
          { type: 'MEDICAL_DISCLAIMER', granted: true, grantedAt: new Date().toISOString(), metadata: null }
        ]),
        onboardingCompletedAt: new Date('2025-01-01T12:00:00.000Z')
      })
    );

    const result = await service.updateProfile('user-123', {
      displayName: 'BioHax Superstar',
      baselineSurvey: {
        trainingLoad: 'moderate'
      },
      consents: [
        { type: 'TERMS_OF_SERVICE', granted: true },
        { type: 'PRIVACY_POLICY', granted: true },
        { type: 'MEDICAL_DISCLAIMER', granted: true }
      ],
      timezone: 'America/Los_Angeles'
    });

    expect(prisma.profile.update).toHaveBeenCalledTimes(1);
    const updateArgs = prisma.profile.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data.onboardingCompletedAt).toEqual(new Date('2025-01-01T12:00:00.000Z'));
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-123' },
        data: { status: UserStatus.ACTIVE }
      })
    );
    expect(result.consents).toHaveLength(3);
    expect(result.onboardingCompletedAt).toEqual(new Date('2025-01-01T12:00:00.000Z'));
    expect(result).toHaveProperty('tokens.access.token', expect.any(String));
  });

  it('ignores deleteRequested toggles coming from profile updates', async () => {
    const prisma = createMockPrisma();
    const service = new OnboardingService(prisma as unknown as PrismaClient);

    prisma.profile.findUnique.mockResolvedValue(createProfileRecord());
    prisma.profile.update.mockResolvedValue(createProfileRecord({ displayName: 'Updated' }));

    const payload = { displayName: 'Updated' } as Record<string, unknown> as {
      displayName: string;
    };
    Object.assign(payload as Record<string, unknown>, { deleteRequested: true });

    await service.updateProfile('user-123', payload);

    const updateCall = prisma.profile.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateCall.data.deleteRequested).toBeUndefined();
  });

  it('returns export job details from the data subject service', async () => {
    const prisma = createMockPrisma();
    const service = new OnboardingService(prisma as unknown as PrismaClient);

    mockedDataSubjectService.requestExport.mockResolvedValue({
      id: 'export-job-1',
      status: 'COMPLETE',
      requestedAt: new Date('2025-02-02T00:00:00.000Z'),
      processedAt: new Date('2025-02-02T00:05:00.000Z'),
      completedAt: new Date('2025-02-02T00:06:00.000Z'),
      expiresAt: new Date('2025-02-16T00:06:00.000Z'),
      result: { data: [] },
      errorMessage: null
    } as never);

    const response = await service.requestDataExport('user-456');

    expect(mockedDataSubjectService.requestExport).toHaveBeenCalledWith('user-456');
    expect(response).toMatchObject({
      id: 'export-job-1',
      status: 'COMPLETE',
      payload: { data: [] }
    });
  });

  it('prevents duplicate delete requests', async () => {
    const prisma = createMockPrisma();
    const service = new OnboardingService(prisma as unknown as PrismaClient);
    const existing = createProfileRecord({
      deleteRequested: true
    });

    prisma.profile.findUnique.mockResolvedValue(existing);

    await expect(service.requestDataDeletion('user-123')).rejects.toBeInstanceOf(HttpError);
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(mockedDataSubjectService.requestDeletion).not.toHaveBeenCalled();
  });

  it('creates a deletion job after marking the profile as pending deletion', async () => {
    const prisma = createMockPrisma();
    const service = new OnboardingService(prisma as unknown as PrismaClient);
    prisma.profile.findUnique.mockResolvedValue(createProfileRecord({ deleteRequested: false }));
    prisma.profile.update.mockResolvedValue(createProfileRecord({ deleteRequested: true }));

    mockedDataSubjectService.requestDeletion.mockResolvedValue({
      id: 'delete-job-1',
      status: 'IN_PROGRESS',
      requestedAt: new Date(),
      processedAt: null,
      completedAt: null,
      deletedSummary: null,
      errorMessage: null
    } as never);

    const response = await service.requestDataDeletion('user-123');

    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      data: { deleteRequested: true }
    });
    expect(mockedDataSubjectService.requestDeletion).toHaveBeenCalledWith('user-123');
    expect(response).toHaveProperty('id', 'delete-job-1');
  });
});
