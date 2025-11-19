import type { PrismaClient, WhoopIntegration, WhoopLinkSession } from '@prisma/client';

import { HttpError } from '../modules/observability-ops/http-error';
import { WhoopService } from '../modules/wearable/whoop.service';
import type { WhoopOAuthClient } from '../modules/wearable/oauth-client';
import type { TokenCrypto } from '../modules/wearable/token-crypto';
import { enqueueAndMaybeRunWhoopSync } from '../modules/wearable/whoop-sync-dispatcher';

jest.mock('../modules/wearable/whoop-sync-dispatcher', () => ({
  enqueueAndMaybeRunWhoopSync: jest.fn()
}));

jest.mock('../modules/dashboard/dashboard.service', () => ({
  dashboardService: {
    invalidateUser: jest.fn().mockResolvedValue(undefined)
  }
}));

type MockPrisma = {
  whoopIntegration: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };
  whoopLinkSession: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  user: {
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

const baseNow = new Date('2025-01-01T00:00:00.000Z');
const createMockPrisma = (): MockPrisma => {
  const prisma: MockPrisma = {
    whoopIntegration: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn()
    },
    whoopLinkSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    user: {
      update: jest.fn()
    },
    $transaction: jest.fn()
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: MockPrisma) => Promise<unknown>) =>
    callback(prisma)
  );

  return prisma;
};

const createSessionRecord = (overrides: Partial<WhoopLinkSession> = {}): WhoopLinkSession => ({
  id: 'session-1',
  userId: 'user-1',
  state: 'state-xyz',
  redirectUri: 'https://app.example.com/whoop/callback',
  scope: ['scope:read'],
  expiresAt: new Date(baseNow.getTime() + 600_000),
  createdAt: baseNow,
  completedAt: null,
  cancelledAt: null,
  ...overrides
});

const createIntegrationRecord = (overrides: Partial<WhoopIntegration> = {}): WhoopIntegration => ({
  id: 'integration-1',
  userId: 'user-1',
  whoopUserId: 'member-123',
  accessToken: 'enc-access',
  refreshToken: 'enc-refresh',
  expiresAt: new Date(baseNow.getTime() + 3_600_000),
  scope: ['scope:read'],
  tokenKeyId: 'key-1',
  tokenRotatedAt: baseNow,
  syncStatus: 'ACTIVE',
  lastSyncedAt: null,
  createdAt: baseNow,
  updatedAt: baseNow,
  ...overrides
});

const createService = (prisma: MockPrisma, overrides: { authorizeUrl?: string } = {}) => {
  const oauthClient: WhoopOAuthClient = {
    exchangeCode: jest.fn()
  };

  const tokenCrypto: TokenCrypto = {
    encrypt: jest.fn((value: string) => `enc-${value}`),
    decrypt: jest.fn()
  };

  const service = new WhoopService(
    prisma as unknown as PrismaClient,
    oauthClient,
    tokenCrypto,
    () => 'state-xyz',
    () => baseNow,
    {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://app.example.com/whoop/callback',
      authorizeUrl: overrides.authorizeUrl ?? 'https://auth.example.com/auth',
      scopes: ['scope:read'],
      stateTtlMs: 600_000,
      tokenKeyId: 'key-1'
    }
  );

  return { service, prisma, oauthClient, tokenCrypto };
};

describe('WhoopService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new link session and returns link details', async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma, {
      authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/authorize'
    });
    const session = createSessionRecord();

    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(null); // inside transaction
    prisma.whoopLinkSession.create.mockResolvedValue(session);
    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(null); // within getStatus
    prisma.whoopLinkSession.findFirst.mockResolvedValueOnce(session);

    const result = await service.initiateLink('user-1');

    expect(prisma.whoopLinkSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
        data: expect.objectContaining({ cancelledAt: baseNow })
      })
    );
    expect(prisma.whoopLinkSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          state: 'state-xyz',
          scope: ['scope:read']
        })
      })
    );
    expect(result.linked).toBe(false);
    expect(result.state).toBe('state-xyz');
    expect(result.linkUrl).toContain('https://api.prod.whoop.com/oauth/oauth2/auth');
    expect(result.linkUrl).toContain('state-xyz');
    expect(result.syncStatus).toBe('PENDING');
  });

  it('preserves custom authorize URLs that already use /auth', async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma, {
      authorizeUrl: 'https://auth.example.com/oauth/oauth2/auth'
    });
    const session = createSessionRecord();

    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(null);
    prisma.whoopLinkSession.create.mockResolvedValue(session);
    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(null);
    prisma.whoopLinkSession.findFirst.mockResolvedValueOnce(session);

    const result = await service.initiateLink('user-1');

    expect(result.linkUrl).toContain('https://auth.example.com/oauth/oauth2/auth');
  });

  it('falls back to the default Whoop authorize URL when override is invalid', async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma, {
      authorizeUrl: 'notaurl'
    });
    const session = createSessionRecord();

    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(null);
    prisma.whoopLinkSession.create.mockResolvedValue(session);
    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(null);
    prisma.whoopLinkSession.findFirst.mockResolvedValueOnce(session);

    const result = await service.initiateLink('user-1');

    expect(result.linkUrl).toContain('https://api.prod.whoop.com/oauth/oauth2/auth');
  });

  it('throws when attempting to link while an active integration exists', async () => {
    const prisma = createMockPrisma();
    const { service } = createService(prisma);
    const integration = createIntegrationRecord();

    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(integration);

    await expect(service.initiateLink('user-1')).rejects.toMatchObject({
      status: 409,
      code: 'WHOOP_ALREADY_LINKED'
    } satisfies Partial<HttpError>);
  });

  it('stores encrypted tokens and updates metadata on completion', async () => {
    const prisma = createMockPrisma();
    const { service, oauthClient, tokenCrypto } = createService(prisma);
    const session = createSessionRecord();
    const integration = createIntegrationRecord();

    prisma.whoopLinkSession.findUnique.mockResolvedValueOnce(session);
    (oauthClient.exchangeCode as jest.Mock).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 1800,
      scope: ['scope:read'],
      whoopUserId: 'member-123'
    });
    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(integration);
    prisma.whoopLinkSession.findFirst.mockResolvedValueOnce(null);

    const result = await service.completeLink({
      userId: 'user-1',
      code: 'auth-code',
      state: 'state-xyz'
    });

    expect(oauthClient.exchangeCode).toHaveBeenCalledWith({
      code: 'auth-code',
      redirectUri: session.redirectUri
    });
    expect(prisma.whoopIntegration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({
          whoopUserId: 'member-123',
          accessToken: 'enc-access-token',
          refreshToken: 'enc-refresh-token',
          tokenKeyId: 'key-1',
          syncStatus: 'ACTIVE'
        }),
        create: expect.objectContaining({
          accessToken: 'enc-access-token',
          refreshToken: 'enc-refresh-token'
        })
      })
    );
    expect(tokenCrypto.encrypt).toHaveBeenCalledWith('access-token');
    expect(tokenCrypto.encrypt).toHaveBeenCalledWith('refresh-token');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { whoopMemberId: 'member-123' }
      })
    );
    expect(result.linked).toBe(true);
    expect(result.linkUrl).toBeNull();
    expect(result.syncStatus).toBe('ACTIVE');
    expect(enqueueAndMaybeRunWhoopSync).toHaveBeenCalledWith(
      prisma,
      {
        userId: 'user-1',
        whoopUserId: 'member-123',
        reason: 'initial-link'
      },
      { swallowErrors: true }
    );
  });

  it('completes link when refresh token is missing', async () => {
    const prisma = createMockPrisma();
    const { service, oauthClient, tokenCrypto } = createService(prisma);
    const session = createSessionRecord();

    prisma.whoopLinkSession.findUnique.mockResolvedValueOnce(session);
    (oauthClient.exchangeCode as jest.Mock).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: null,
      expiresIn: 1800,
      scope: ['scope:read'],
      whoopUserId: 'member-123'
    });
    const integration = createIntegrationRecord();
    prisma.whoopIntegration.findUnique.mockResolvedValueOnce(integration);
    prisma.whoopLinkSession.findFirst.mockResolvedValueOnce(null);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await service.completeLink({
      userId: 'user-1',
      code: 'auth-code',
      state: 'state-xyz'
    });

    expect(tokenCrypto.encrypt).toHaveBeenCalledTimes(1);
    expect(prisma.whoopIntegration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          refreshToken: null
        }),
        create: expect.objectContaining({
          refreshToken: null
        })
      })
    );
    expect(result.linked).toBe(true);
    warnSpy.mockRestore();
  });
});
