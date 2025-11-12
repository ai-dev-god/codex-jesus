import type { Prisma, PrismaClient, Profile } from '@prisma/client';
import { Role, UserStatus } from '@prisma/client';

import { OnboardingService } from '../modules/onboarding/onboarding.service';
import { HttpError } from '../modules/observability-ops/http-error';

type MockPrisma = {
  profile: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  user: {
    update: jest.Mock;
  };
  adminAuditLog: {
    create: jest.Mock;
    findFirst: jest.Mock;
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
    adminAuditLog: {
      create: jest.fn(),
      findFirst: jest.fn()
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

  it('records audit metadata when requesting a data export', async () => {
    const prisma = createMockPrisma();
    const service = new OnboardingService(prisma as unknown as PrismaClient, () => 'export-request-1');

    jest.useFakeTimers().setSystemTime(new Date('2025-02-02T00:00:00.000Z'));

    const response = await service.requestDataExport('user-456');

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'user-456',
          action: 'PROFILE_DATA_EXPORT_REQUESTED',
          targetType: 'DATA_EXPORT_REQUEST',
          targetId: 'export-request-1'
        })
      })
    );

    expect(response).toEqual({
      id: 'export-request-1',
      status: 'PENDING',
      requestedAt: new Date('2025-02-02T00:00:00.000Z'),
      completedAt: null,
      downloadUrl: null,
      expiresAt: null,
      failureReason: null
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
  });
});
