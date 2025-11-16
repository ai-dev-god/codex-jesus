import type { AuthProvider, MembershipInvite, PrismaClient, User } from '@prisma/client';
import type { OAuth2Client } from 'google-auth-library';
import type { Request, Response } from 'express';
import { AuthProviderType, MembershipInviteStatus, Role, UserStatus } from '@prisma/client';

import env from '../config/env';
import { IdentityService } from '../modules/identity/identity.service';
import { requireAdmin, requireActiveUser } from '../modules/identity/guards';
import { sessionMiddleware } from '../modules/identity/session-middleware';
import { tokenService } from '../modules/identity/token-service';
import { hashPassword, verifyPassword } from '../modules/identity/password';
import { HttpError } from '../modules/observability-ops/http-error';

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  profile: {
    create: jest.Mock;
  };
  authProvider: {
    create: jest.Mock;
    upsert: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
  };
  membershipInvite: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  membershipInviteRedemption: {
    create: jest.Mock;
  };
  loginAudit: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
};

const createMockPrisma = (): MockPrisma => {
  const mock: MockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn()
    },
    profile: {
      create: jest.fn()
    },
    authProvider: {
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn()
    },
    membershipInvite: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({})
    },
    membershipInviteRedemption: {
      create: jest.fn()
    },
    loginAudit: {
      create: jest.fn()
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1)
  };

  mock.$transaction.mockImplementation(async (callback: (tx: MockPrisma) => Promise<unknown>) =>
    callback({
      user: mock.user,
      profile: mock.profile,
      authProvider: mock.authProvider,
      membershipInvite: mock.membershipInvite,
      membershipInviteRedemption: mock.membershipInviteRedemption,
      $executeRaw: jest.fn().mockResolvedValue(1)
    } as unknown as MockPrisma)
  );

  return mock;
};

const createUserRecord = (overrides: Partial<User> = {}): User => {
  const now = new Date();
  return {
    id: 'user-123',
    email: 'member@example.com',
    passwordHash: '$2a$10$something',
    fullName: 'BioHax Member',
    role: Role.MEMBER,
    status: UserStatus.PENDING_ONBOARDING,
    whoopMemberId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
};

const createProviderRecord = (user: User, overrides: Partial<AuthProvider> = {}): AuthProvider & { user: User } => {
  const now = new Date();
  return {
    id: 'provider-1',
    userId: user.id,
    type: AuthProviderType.EMAIL_PASSWORD,
    providerUserId: user.email,
    accessToken: null,
    refreshToken: null,
    scopes: [],
    expiresAt: null,
    linkedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    user
  };
};

const createInviteRecord = (overrides: Partial<MembershipInvite> = {}): MembershipInvite => {
  const now = new Date();
  return {
    id: 'invite-1',
    code: 'CODE123',
    email: null,
    status: MembershipInviteStatus.ACTIVE,
    maxUses: 1,
    usedCount: 0,
    expiresAt: null,
    metadata: null,
    createdById: null,
    lastRedeemedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
};

const createService = (prisma: MockPrisma): IdentityService => {
  const googleClientStub = {
    verifyIdToken: jest.fn()
  } as unknown as OAuth2Client;
  return new IdentityService(prisma as unknown as PrismaClient, tokenService, googleClientStub);
};

describe('IdentityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.ALLOW_EMAIL_SIGNUPS = false;
  });

  it('hashes password and issues tokens on registration when enabled', async () => {
    env.ALLOW_EMAIL_SIGNUPS = true;
    const prisma = createMockPrisma();
    const service = createService(prisma);
    const registeredUser = createUserRecord({ passwordHash: 'hashed' });
    const invite = createInviteRecord();

    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.membershipInvite.findUnique
      .mockResolvedValueOnce(invite)
      .mockResolvedValueOnce({ ...invite, usedCount: 1 });
    prisma.membershipInvite.update.mockResolvedValue(invite);
    prisma.membershipInviteRedemption.create.mockResolvedValue({});
    prisma.user.create.mockResolvedValue(registeredUser);
    prisma.profile.create.mockResolvedValue({});
    prisma.authProvider.create.mockResolvedValue({});
    prisma.loginAudit.create.mockResolvedValue({});
    prisma.authProvider.upsert.mockResolvedValue({});

    const response = await service.registerWithEmail(
      {
        email: 'member@example.com',
        password: 'averysecurepassword',
        displayName: 'New Member',
        timezone: 'America/Los_Angeles',
        acceptedTerms: true,
        inviteCode: 'code123'
      },
      {
        ipAddress: '127.0.0.1',
        userAgent: 'jest'
      }
    );

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.user.create.mock.calls[0][0].data;
    expect(createArgs.email).toBe('member@example.com');
    expect(createArgs.passwordHash).not.toBe('averysecurepassword');
    expect(await verifyPassword('averysecurepassword', createArgs.passwordHash)).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(response.user.email).toBe('member@example.com');
    expect(response.tokens.accessToken).toEqual(expect.any(String));
    expect(response.tokens.refreshToken).toEqual(expect.any(String));
    expect(prisma.authProvider.upsert).toHaveBeenCalled();
    expect(prisma.loginAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'member@example.com',
          success: true
        })
      })
    );
  });

  it('returns conflict when a concurrent duplicate registration occurs', async () => {
    env.ALLOW_EMAIL_SIGNUPS = true;
    const prisma = createMockPrisma();
    const service = createService(prisma);
    const invite = createInviteRecord();

    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.membershipInvite.findUnique.mockResolvedValue(invite);
    prisma.$transaction.mockImplementation(async () => {
      const error = { code: 'P2002' };
      throw error;
    });

    let thrown: HttpError | null = null;
    await service
      .registerWithEmail(
        {
          email: 'member@example.com',
          password: 'averysecurepassword',
          displayName: 'New Member',
          timezone: 'America/Los_Angeles',
          acceptedTerms: true,
          inviteCode: 'code123'
        },
        {
          ipAddress: '127.0.0.1',
          userAgent: 'jest'
        }
      )
      .catch((error) => {
        thrown = error as HttpError;
      });

    if (!thrown) {
      throw new Error('Expected registration to throw HttpError');
    }

    const error = thrown as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(409);
    expect(prisma.loginAudit.create).not.toHaveBeenCalled();
  });

  it('rejects registration attempts when signups are disabled', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);

    let thrown: HttpError | null = null;
    await service
      .registerWithEmail(
        {
          email: 'member@example.com',
          password: 'averysecurepassword',
          displayName: 'New Member',
          timezone: 'America/Los_Angeles',
          acceptedTerms: true,
          inviteCode: 'code123'
        },
        {
          ipAddress: '127.0.0.1',
          userAgent: 'jest'
        }
      )
      .catch((error) => {
        thrown = error as HttpError;
      });

    expect(thrown).toBeInstanceOf(HttpError);
    if (!thrown) {
      throw new Error('Expected registration to throw HttpError');
    }
    const error = thrown as HttpError;
    expect(error.status).toBe(403);
    expect(error.code).toBe('SIGNUPS_DISABLED');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects invalid password attempts and records audit entry', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    const storedUser = createUserRecord({
      passwordHash: await hashPassword('correct-password')
    });

    prisma.user.findUnique.mockResolvedValue(storedUser);
    prisma.loginAudit.create.mockResolvedValue({});

    await expect(
      service.loginWithEmail(
        {
          email: 'member@example.com',
          password: 'wrong-password'
        },
        {
          ipAddress: '127.0.0.1',
          userAgent: 'jest'
        }
      )
    ).rejects.toBeInstanceOf(HttpError);

    expect(prisma.loginAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'member@example.com',
          success: false,
          failureReason: 'INVALID_CREDENTIALS'
        })
      })
    );
  });

  it('rotates refresh tokens on refresh call', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    const activeUser = createUserRecord({
      id: 'user-rotating',
      status: UserStatus.ACTIVE
    });

    const originalRefresh = tokenService.issueRefreshToken({
      userId: activeUser.id,
      provider: AuthProviderType.EMAIL_PASSWORD
    });
    const encrypted = tokenService.encryptRefreshToken(originalRefresh.token);
    const providerRecord = createProviderRecord(activeUser, {
      refreshToken: encrypted,
      expiresAt: new Date(Date.now() + 1000 * 60)
    });

    prisma.authProvider.findUnique.mockResolvedValue(providerRecord);
    prisma.authProvider.upsert.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue(activeUser);

    const result = await service.refreshTokens({ refreshToken: originalRefresh.token });

    expect(result.tokens.refreshToken).toEqual(expect.any(String));
    expect(prisma.authProvider.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          refreshToken: expect.any(String)
        })
      })
    );

    const updated = prisma.authProvider.upsert.mock.calls[0][0].update.refreshToken;
    expect(updated).not.toBe(encrypted);
  });

  it('revokes a specific refresh session when the authenticated user provides it', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    const activeUser = createUserRecord({ id: 'logout-owner', status: UserStatus.ACTIVE });
    const { token } = tokenService.issueRefreshToken({
      userId: activeUser.id,
      provider: AuthProviderType.EMAIL_PASSWORD
    });

    prisma.authProvider.update.mockResolvedValue({});

    await service.logout(activeUser.id, token);

    expect(prisma.authProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_type: {
            userId: activeUser.id,
            type: AuthProviderType.EMAIL_PASSWORD
          }
        }
      })
    );
  });

  it('rejects logout attempts when the refresh token belongs to another user', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    const otherToken = tokenService.issueRefreshToken({
      userId: 'different-user',
      provider: AuthProviderType.EMAIL_PASSWORD
    });

    await expect(service.logout('attacker', otherToken.token)).rejects.toBeInstanceOf(HttpError);
    expect(prisma.authProvider.update).not.toHaveBeenCalled();
  });

  it('revokes all refresh sessions for the current user when no token is supplied', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    const activeUser = createUserRecord({ id: 'logout-all', status: UserStatus.ACTIVE });

    prisma.authProvider.updateMany.mockResolvedValue({ count: 1 });

    await service.logout(activeUser.id);

    expect(prisma.authProvider.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: activeUser.id },
        data: {
          refreshToken: null,
          expiresAt: null
        }
      })
    );
  });
});

describe('RBAC guards', () => {
  it('prevents non-admin users from accessing admin routes', () => {
    const req = {
      user: {
        id: 'user-1',
        email: 'member@example.com',
        role: Role.MEMBER,
        status: UserStatus.ACTIVE
      }
    } as unknown as Request;
    const res = {} as Response;
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const err = next.mock.calls[0][0] as HttpError;
    expect(err.status).toBe(403);
  });

  it('blocks pending users from active-only routes', () => {
    const req = {
      user: {
        id: 'user-2',
        email: 'pending@example.com',
        role: Role.MEMBER,
        status: UserStatus.PENDING_ONBOARDING
      }
    } as unknown as Request;
    const res = {} as Response;
    const next = jest.fn();

    requireActiveUser(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const err = next.mock.calls[0][0] as HttpError;
    expect(err.status).toBe(403);
  });
});

describe('sessionMiddleware', () => {
  it('attaches decoded user information to the request', () => {
    const access = tokenService.issueAccessToken({
      id: 'session-user',
      email: 'session@example.com',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE
    });

    const req = {
      headers: {
        authorization: `Bearer ${access.token}`
      }
    } as unknown as Request;
    const res = {} as Response;
    const next = jest.fn();

    sessionMiddleware(req, res, next);

    expect(req.user).toEqual(
      expect.objectContaining({
        id: 'session-user',
        email: 'session@example.com',
        role: Role.ADMIN,
        status: UserStatus.ACTIVE
      })
    );
    expect(next).toHaveBeenCalled();
  });
});
