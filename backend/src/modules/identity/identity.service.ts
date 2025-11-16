import type { MembershipInvite, Prisma, PrismaClient, User } from '@prisma/client';
import { AuthProviderType, MembershipInviteStatus, Role, UserStatus } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import { hashPassword, verifyPassword } from './password';
import { TokenService, tokenService as tokenServiceSingleton } from './token-service';
import type { AuthResponse, GoogleLoginInput, LoginInput, LoginAuditContext, RefreshInput, RegisterInput, RequestContext, SerializedUser } from './types';

const DEFAULT_GOOGLE_DISPLAY_NAME = 'New BioHax Member';
const DEFAULT_TIMEZONE = 'UTC';

const normalizeInviteCode = (code: string): string => code.trim().toUpperCase();
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export class IdentityService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
    private readonly googleClient: OAuth2Client
  ) {}

  async registerWithEmail(input: RegisterInput, context: RequestContext = {}): Promise<AuthResponse> {
    if (!input.acceptedTerms) {
      throw new HttpError(400, 'Terms must be accepted to create an account', 'TERMS_NOT_ACCEPTED');
    }

    const normalizedEmail = normalizeEmail(input.email);
    const invite = await this.requireInviteForRegistration(input.inviteCode, normalizedEmail);
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new HttpError(409, 'Email is already registered', 'EMAIL_IN_USE');
    }

    const passwordHash = await hashPassword(input.password);
    const consents = input.marketingOptIn
      ? [
          {
            type: 'MARKETING_EMAIL',
            granted: true,
            grantedAt: new Date().toISOString()
          }
        ]
      : [];

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            fullName: input.displayName,
            role: Role.MEMBER,
            status: UserStatus.PENDING_ONBOARDING
          }
        });

        await tx.profile.create({
          data: {
            userId: createdUser.id,
            displayName: input.displayName,
            timezone: input.timezone,
            consents: consents.length > 0 ? (consents as Prisma.InputJsonValue) : undefined
          }
        });

        await tx.authProvider.create({
          data: {
            userId: createdUser.id,
            type: AuthProviderType.EMAIL_PASSWORD,
            providerUserId: normalizedEmail
          }
        });

        await this.consumeInvite(tx, invite.id, createdUser.id, normalizedEmail);

        return createdUser;
      });

      const response = await this.issueAuthTokens(user, AuthProviderType.EMAIL_PASSWORD);
      await this.logLoginAttempt({
        email: normalizedEmail,
        provider: AuthProviderType.EMAIL_PASSWORD,
        success: true,
        userId: user.id,
        ...context
      });

      return response;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new HttpError(409, 'Email is already registered', 'EMAIL_IN_USE');
      }

      throw error;
    }
  }

  async loginWithEmail(input: LoginInput, context: RequestContext = {}): Promise<AuthResponse> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.passwordHash) {
      await this.logLoginAttempt({
        email: normalizedEmail,
        provider: AuthProviderType.EMAIL_PASSWORD,
        success: false,
        failureReason: 'INVALID_CREDENTIALS',
        userId: user?.id,
        ...context
      });
      throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.logLoginAttempt({
        email: normalizedEmail,
        provider: AuthProviderType.EMAIL_PASSWORD,
        success: false,
        failureReason: 'ACCOUNT_SUSPENDED',
        userId: user.id,
        ...context
      });
      throw new HttpError(423, 'Account is currently suspended', 'ACCOUNT_SUSPENDED');
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      await this.logLoginAttempt({
        email: normalizedEmail,
        provider: AuthProviderType.EMAIL_PASSWORD,
        success: false,
        failureReason: 'INVALID_CREDENTIALS',
        userId: user.id,
        ...context
      });
      throw new HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const freshUser = await this.getUserOrThrow(user.id);
    const response = await this.issueAuthTokens(freshUser, AuthProviderType.EMAIL_PASSWORD);
    await this.logLoginAttempt({
      email: normalizedEmail,
      provider: AuthProviderType.EMAIL_PASSWORD,
      success: true,
      userId: user.id,
      ...context
    });

    return response;
  }

  async loginWithGoogle(input: GoogleLoginInput, context: RequestContext = {}): Promise<AuthResponse> {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new HttpError(503, 'Google authentication is not configured', 'GOOGLE_AUTH_DISABLED');
    }

    let ticketPayload: {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: env.GOOGLE_CLIENT_ID
      });
      ticketPayload = ticket.getPayload() ?? {};
    } catch {
      await this.logLoginAttempt({
        email: 'unknown',
        provider: AuthProviderType.GOOGLE,
        success: false,
        failureReason: 'TOKEN_VERIFICATION_FAILED',
        ...context
      });
      throw new HttpError(401, 'Invalid Google credential', 'GOOGLE_TOKEN_INVALID');
    }

    const googleId = ticketPayload.sub;
    const email = ticketPayload.email?.trim().toLowerCase();

    if (!googleId || !email) {
      await this.logLoginAttempt({
        email: email ?? 'unknown',
        provider: AuthProviderType.GOOGLE,
        success: false,
        failureReason: 'MISSING_CLAIMS',
        ...context
      });
      throw new HttpError(401, 'Google credential is missing required claims', 'GOOGLE_CLAIMS_MISSING');
    }

    if (ticketPayload.email_verified === false) {
      await this.logLoginAttempt({
        email,
        provider: AuthProviderType.GOOGLE,
        success: false,
        failureReason: 'EMAIL_UNVERIFIED',
        ...context
      });
      throw new HttpError(401, 'Google email must be verified', 'GOOGLE_EMAIL_UNVERIFIED');
    }

    const existingProvider = await this.prisma.authProvider.findFirst({
      where: {
        type: AuthProviderType.GOOGLE,
        providerUserId: googleId
      },
      include: {
        user: true
      }
    });

    let user: User;
    let pendingInvite: MembershipInvite | null = null;

    if (existingProvider) {
      user = existingProvider.user;
    } else {
      const existingUserByEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingUserByEmail) {
        await this.ensureGoogleProvider(existingUserByEmail.id, googleId);
        user = existingUserByEmail;
      } else {
        pendingInvite = await this.findInviteForEmail(email);
        if (!pendingInvite) {
          await this.logLoginAttempt({
            email,
            provider: AuthProviderType.GOOGLE,
            success: false,
            failureReason: 'INVITE_REQUIRED',
            ...context
          });
          throw new HttpError(403, 'BioHax membership is invite-only. Request an invite to join.', 'INVITE_REQUIRED');
        }

        user = await this.createUserFromGoogle({
          email,
          googleId,
          displayName: ticketPayload.name ?? DEFAULT_GOOGLE_DISPLAY_NAME,
          timezone: input.timezone ?? DEFAULT_TIMEZONE,
          invite: pendingInvite
        });
      }
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.logLoginAttempt({
        email,
        provider: AuthProviderType.GOOGLE,
        success: false,
        failureReason: 'ACCOUNT_SUSPENDED',
        userId: user.id,
        ...context
      });
      throw new HttpError(423, 'Account is currently suspended', 'ACCOUNT_SUSPENDED');
    }

    const freshUser = await this.getUserOrThrow(user.id);
    const response = await this.issueAuthTokens(freshUser, AuthProviderType.GOOGLE);
    await this.logLoginAttempt({
      email,
      provider: AuthProviderType.GOOGLE,
      success: true,
      userId: user.id,
      ...context
    });

    return response;
  }

  async refreshTokens(input: RefreshInput): Promise<AuthResponse> {
    let decoded;
    try {
      decoded = this.tokenService.verifyRefreshToken(input.refreshToken);
    } catch {
      throw new HttpError(401, 'Invalid refresh token', 'REFRESH_INVALID');
    }

    const authProvider = await this.prisma.authProvider.findUnique({
      where: {
        userId_type: {
          userId: decoded.sub,
          type: decoded.provider
        }
      },
      include: {
        user: true
      }
    });

    if (!authProvider) {
      throw new HttpError(401, 'Refresh token is not recognized', 'REFRESH_UNKNOWN');
    }

    if (authProvider.expiresAt && authProvider.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(401, 'Refresh session expired', 'REFRESH_EXPIRED');
    }

    const storedToken = authProvider.refreshToken
      ? this.tokenService.decryptRefreshToken(authProvider.refreshToken)
      : null;

    if (!storedToken || storedToken !== input.refreshToken) {
      throw new HttpError(401, 'Refresh token mismatch', 'REFRESH_MISMATCH');
    }

    if (authProvider.user.status === UserStatus.SUSPENDED) {
      throw new HttpError(423, 'Account is currently suspended', 'ACCOUNT_SUSPENDED');
    }

    const freshUser = await this.getUserOrThrow(authProvider.user.id);
    return this.issueAuthTokens(freshUser, decoded.provider);
  }

  async logout(userId: string | null, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      try {
        const decoded = this.tokenService.verifyRefreshToken(refreshToken);
        if (userId && decoded.sub !== userId) {
          throw new HttpError(401, 'Refresh token does not belong to the current user', 'REFRESH_INVALID');
        }

        await this.prisma.authProvider.update({
          where: {
            userId_type: {
              userId,
              type: decoded.provider
            }
          },
          data: {
            refreshToken: null,
            expiresAt: null
          }
        });

        return;
      } catch (error) {
        if (error instanceof HttpError) {
          throw error;
        }
        throw new HttpError(401, 'Invalid refresh token', 'REFRESH_INVALID');
      }
    }

    if (!userId) {
      return;
    }

    await this.prisma.authProvider.updateMany({
      where: { userId },
      data: {
        refreshToken: null,
        expiresAt: null
      }
    });
  }

  async getCurrentUser(userId: string): Promise<SerializedUser> {
    const user = await this.getUserOrThrow(userId);
    return this.serializeUser(user);
  }

  private async ensureGoogleProvider(userId: string, providerUserId: string): Promise<void> {
    await this.prisma.authProvider.upsert({
      where: {
        userId_type: {
          userId,
          type: AuthProviderType.GOOGLE
        }
      },
      update: {
        providerUserId,
        linkedAt: new Date()
      },
      create: {
        userId,
        type: AuthProviderType.GOOGLE,
        providerUserId
      }
    });
  }

  private async createUserFromGoogle(params: {
    email: string;
    googleId: string;
    displayName: string;
    timezone: string;
    invite?: MembershipInvite | null;
  }): Promise<User> {
    const normalizedEmail = normalizeEmail(params.email);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          fullName: params.displayName,
          role: Role.MEMBER,
          status: UserStatus.PENDING_ONBOARDING
        }
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          displayName: params.displayName,
          timezone: params.timezone
        }
      });

      await tx.authProvider.create({
        data: {
          userId: user.id,
          type: AuthProviderType.GOOGLE,
          providerUserId: params.googleId
        }
      });

      if (params.invite) {
        await this.consumeInvite(tx, params.invite.id, user.id, normalizedEmail);
      }

      return user;
    });
  }

  private async requireInviteForRegistration(inviteCode: string, email: string): Promise<MembershipInvite> {
    if (!inviteCode?.trim()) {
      throw new HttpError(403, 'An invite code is required to join BioHax.', 'INVITE_REQUIRED');
    }

    const normalizedCode = normalizeInviteCode(inviteCode);
    const invite = await this.prisma.membershipInvite.findUnique({ where: { code: normalizedCode } });
    if (!invite) {
      throw new HttpError(403, 'Invite code is invalid.', 'INVITE_INVALID');
    }

    const normalizedEmail = normalizeEmail(email);
    if (invite.email && normalizeEmail(invite.email) !== normalizedEmail) {
      throw new HttpError(403, 'This invite is assigned to a different email.', 'INVITE_EMAIL_MISMATCH');
    }

    if (this.isInviteExpired(invite) || invite.status === MembershipInviteStatus.EXPIRED) {
      await this.markInviteExpired(invite.id);
      throw new HttpError(403, 'This invite has expired.', 'INVITE_EXPIRED');
    }

    if (invite.status === MembershipInviteStatus.REVOKED) {
      throw new HttpError(403, 'This invite is no longer valid.', 'INVITE_REVOKED');
    }

    if (invite.status === MembershipInviteStatus.REDEEMED || invite.usedCount >= invite.maxUses) {
      await this.markInviteRedeemed(invite.id);
      throw new HttpError(403, 'Invite code has already been used.', 'INVITE_CONSUMED');
    }

    return invite;
  }

  private async findInviteForEmail(email: string): Promise<MembershipInvite | null> {
    const normalizedEmail = normalizeEmail(email);
    const invites = await this.prisma.membershipInvite.findMany({
      where: {
        email: normalizedEmail,
        status: MembershipInviteStatus.ACTIVE
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    for (const invite of invites) {
      if (this.isInviteExpired(invite)) {
        await this.markInviteExpired(invite.id);
        continue;
      }

      if (invite.usedCount >= invite.maxUses) {
        await this.markInviteRedeemed(invite.id);
        continue;
      }

      return invite;
    }

    return null;
  }

  private async consumeInvite(
    tx: Prisma.TransactionClient,
    inviteId: string,
    userId: string,
    email: string
  ): Promise<void> {
    const now = new Date();
    const updated = await tx.$executeRaw`
      UPDATE "MembershipInvite"
      SET "usedCount" = "usedCount" + 1,
          "lastRedeemedAt" = ${now},
          "updatedAt" = ${now}
      WHERE "id" = ${inviteId}
        AND "status" = ${MembershipInviteStatus.ACTIVE}
        AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
        AND "usedCount" < "maxUses";
    `;

    if (updated === 0) {
      throw new HttpError(403, 'Invite can no longer be used.', 'INVITE_CONSUMED');
    }

    await tx.membershipInviteRedemption.create({
      data: {
        inviteId,
        userId,
        email: normalizeEmail(email)
      }
    });

    const latest = await tx.membershipInvite.findUnique({ where: { id: inviteId } });
    if (latest && latest.usedCount >= latest.maxUses && latest.status !== MembershipInviteStatus.REDEEMED) {
      await tx.membershipInvite.update({
        where: { id: inviteId },
        data: { status: MembershipInviteStatus.REDEEMED }
      });
    }
  }

  private isInviteExpired(invite: MembershipInvite): boolean {
    return Boolean(invite.expiresAt && invite.expiresAt.getTime() <= Date.now());
  }

  private async markInviteExpired(inviteId: string): Promise<void> {
    await this.prisma.membershipInvite
      .update({
        where: { id: inviteId },
        data: { status: MembershipInviteStatus.EXPIRED }
      })
      .catch(() => undefined);
  }

  private async markInviteRedeemed(inviteId: string): Promise<void> {
    await this.prisma.membershipInvite
      .update({
        where: { id: inviteId },
        data: { status: MembershipInviteStatus.REDEEMED }
      })
      .catch(() => undefined);
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }
    return user;
  }

  private serializeUser(user: User): SerializedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }

  private async issueAuthTokens(user: User, provider: AuthProviderType): Promise<AuthResponse> {
    const access = this.tokenService.issueAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status
    });

    const refresh = this.tokenService.issueRefreshToken({
      userId: user.id,
      provider
    });

    const encryptedRefresh = this.tokenService.encryptRefreshToken(refresh.token);
    const refreshExpiry = new Date(Date.now() + refresh.expiresIn * 1000);

    await this.prisma.authProvider.upsert({
      where: {
        userId_type: {
          userId: user.id,
          type: provider
        }
      },
      update: {
        refreshToken: encryptedRefresh,
        expiresAt: refreshExpiry,
        linkedAt: new Date()
      },
      create: {
        userId: user.id,
        type: provider,
        providerUserId: provider === AuthProviderType.EMAIL_PASSWORD ? user.email : null,
        refreshToken: encryptedRefresh,
        expiresAt: refreshExpiry
      }
    });

    return {
      user: this.serializeUser(user),
      tokens: {
        accessToken: access.token,
        refreshToken: refresh.token,
        expiresIn: access.expiresIn,
        refreshExpiresIn: refresh.expiresIn
      }
    };
  }

  private async logLoginAttempt(details: LoginAuditContext): Promise<void> {
    try {
      await this.prisma.loginAudit.create({
        data: {
          email: details.email,
          provider: details.provider,
          success: details.success,
          userId: details.userId ?? null,
          ipAddress: details.ipAddress,
          userAgent: details.userAgent,
          failureReason: details.failureReason
        }
      });
    } catch (error) {
      console.warn('[identity] Failed to record login audit', {
        userId: details.userId,
        email: details.email,
        error: (error as Error).message
      });
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
  }
}

const defaultGoogleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

export const identityService = new IdentityService(prismaClient, tokenServiceSingleton, defaultGoogleClient);
