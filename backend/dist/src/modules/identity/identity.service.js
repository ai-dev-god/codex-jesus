"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.identityService = exports.IdentityService = void 0;
const client_1 = require("@prisma/client");
const google_auth_library_1 = require("google-auth-library");
const env_1 = __importDefault(require("../../config/env"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const password_1 = require("./password");
const token_service_1 = require("./token-service");
const DEFAULT_GOOGLE_DISPLAY_NAME = 'New BioHax Member';
const DEFAULT_TIMEZONE = 'UTC';
const SIGNUPS_DISABLED_MESSAGE = 'BioHax membership is invite-only and new signups are currently closed.';
const SIGNUPS_DISABLED_CODE = 'SIGNUPS_DISABLED';
const normalizeInviteCode = (code) => code.trim().toUpperCase();
const normalizeEmail = (email) => email.trim().toLowerCase();
class IdentityService {
    constructor(prisma, tokenService, googleClient) {
        this.prisma = prisma;
        this.tokenService = tokenService;
        this.googleClient = googleClient;
    }
    async registerWithEmail(input, context = {}) {
        if (!env_1.default.ALLOW_EMAIL_SIGNUPS) {
            throw new http_error_1.HttpError(403, SIGNUPS_DISABLED_MESSAGE, SIGNUPS_DISABLED_CODE);
        }
        if (!input.acceptedTerms) {
            throw new http_error_1.HttpError(400, 'Terms must be accepted to create an account', 'TERMS_NOT_ACCEPTED');
        }
        const normalizedEmail = normalizeEmail(input.email);
        const invite = await this.requireInviteForRegistration(input.inviteCode, normalizedEmail);
        const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            throw new http_error_1.HttpError(409, 'Email is already registered', 'EMAIL_IN_USE');
        }
        const passwordHash = await (0, password_1.hashPassword)(input.password);
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
                        role: client_1.Role.MEMBER,
                        status: client_1.UserStatus.PENDING_ONBOARDING
                    }
                });
                await tx.profile.create({
                    data: {
                        userId: createdUser.id,
                        displayName: input.displayName,
                        timezone: input.timezone,
                        consents: consents.length > 0 ? consents : undefined
                    }
                });
                await tx.authProvider.create({
                    data: {
                        userId: createdUser.id,
                        type: client_1.AuthProviderType.EMAIL_PASSWORD,
                        providerUserId: normalizedEmail
                    }
                });
                await this.consumeInvite(tx, invite.id, createdUser.id, normalizedEmail);
                return createdUser;
            });
            const response = await this.issueAuthTokens(user, client_1.AuthProviderType.EMAIL_PASSWORD);
            await this.logLoginAttempt({
                email: normalizedEmail,
                provider: client_1.AuthProviderType.EMAIL_PASSWORD,
                success: true,
                userId: user.id,
                ...context
            });
            return response;
        }
        catch (error) {
            if (this.isUniqueConstraintError(error)) {
                throw new http_error_1.HttpError(409, 'Email is already registered', 'EMAIL_IN_USE');
            }
            throw error;
        }
    }
    async loginWithEmail(input, context = {}) {
        const normalizedEmail = input.email.trim().toLowerCase();
        const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user || !user.passwordHash) {
            await this.logLoginAttempt({
                email: normalizedEmail,
                provider: client_1.AuthProviderType.EMAIL_PASSWORD,
                success: false,
                failureReason: 'INVALID_CREDENTIALS',
                userId: user?.id,
                ...context
            });
            throw new http_error_1.HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
        }
        if (user.status === client_1.UserStatus.SUSPENDED) {
            await this.logLoginAttempt({
                email: normalizedEmail,
                provider: client_1.AuthProviderType.EMAIL_PASSWORD,
                success: false,
                failureReason: 'ACCOUNT_SUSPENDED',
                userId: user.id,
                ...context
            });
            throw new http_error_1.HttpError(423, 'Account is currently suspended', 'ACCOUNT_SUSPENDED');
        }
        const passwordMatches = await (0, password_1.verifyPassword)(input.password, user.passwordHash);
        if (!passwordMatches) {
            await this.logLoginAttempt({
                email: normalizedEmail,
                provider: client_1.AuthProviderType.EMAIL_PASSWORD,
                success: false,
                failureReason: 'INVALID_CREDENTIALS',
                userId: user.id,
                ...context
            });
            throw new http_error_1.HttpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
        }
        const freshUser = await this.getUserOrThrow(user.id);
        const response = await this.issueAuthTokens(freshUser, client_1.AuthProviderType.EMAIL_PASSWORD);
        await this.logLoginAttempt({
            email: normalizedEmail,
            provider: client_1.AuthProviderType.EMAIL_PASSWORD,
            success: true,
            userId: user.id,
            ...context
        });
        return response;
    }
    async loginWithGoogle(input, context = {}) {
        if (!env_1.default.GOOGLE_CLIENT_ID) {
            throw new http_error_1.HttpError(503, 'Google authentication is not configured', 'GOOGLE_AUTH_DISABLED');
        }
        let ticketPayload;
        try {
            const ticket = await this.googleClient.verifyIdToken({
                idToken: input.idToken,
                audience: env_1.default.GOOGLE_CLIENT_ID
            });
            ticketPayload = ticket.getPayload() ?? {};
        }
        catch {
            await this.logLoginAttempt({
                email: 'unknown',
                provider: client_1.AuthProviderType.GOOGLE,
                success: false,
                failureReason: 'TOKEN_VERIFICATION_FAILED',
                ...context
            });
            throw new http_error_1.HttpError(401, 'Invalid Google credential', 'GOOGLE_TOKEN_INVALID');
        }
        const googleId = ticketPayload.sub;
        const email = ticketPayload.email?.trim().toLowerCase();
        if (!googleId || !email) {
            await this.logLoginAttempt({
                email: email ?? 'unknown',
                provider: client_1.AuthProviderType.GOOGLE,
                success: false,
                failureReason: 'MISSING_CLAIMS',
                ...context
            });
            throw new http_error_1.HttpError(401, 'Google credential is missing required claims', 'GOOGLE_CLAIMS_MISSING');
        }
        if (ticketPayload.email_verified === false) {
            await this.logLoginAttempt({
                email,
                provider: client_1.AuthProviderType.GOOGLE,
                success: false,
                failureReason: 'EMAIL_UNVERIFIED',
                ...context
            });
            throw new http_error_1.HttpError(401, 'Google email must be verified', 'GOOGLE_EMAIL_UNVERIFIED');
        }
        const existingProvider = await this.prisma.authProvider.findFirst({
            where: {
                type: client_1.AuthProviderType.GOOGLE,
                providerUserId: googleId
            },
            include: {
                user: true
            }
        });
        let user;
        let pendingInvite = null;
        if (existingProvider) {
            user = existingProvider.user;
        }
        else {
            const existingUserByEmail = await this.prisma.user.findUnique({ where: { email } });
            if (existingUserByEmail) {
                await this.ensureGoogleProvider(existingUserByEmail.id, googleId);
                user = existingUserByEmail;
            }
            else {
                if (!env_1.default.ALLOW_EMAIL_SIGNUPS) {
                    await this.logLoginAttempt({
                        email,
                        provider: client_1.AuthProviderType.GOOGLE,
                        success: false,
                        failureReason: SIGNUPS_DISABLED_CODE,
                        ...context
                    });
                    throw new http_error_1.HttpError(403, SIGNUPS_DISABLED_MESSAGE, SIGNUPS_DISABLED_CODE);
                }
                pendingInvite = await this.findInviteForEmail(email);
                if (!pendingInvite) {
                    await this.logLoginAttempt({
                        email,
                        provider: client_1.AuthProviderType.GOOGLE,
                        success: false,
                        failureReason: 'INVITE_REQUIRED',
                        ...context
                    });
                    throw new http_error_1.HttpError(403, 'BioHax membership is invite-only. Request an invite to join.', 'INVITE_REQUIRED');
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
        if (user.status === client_1.UserStatus.SUSPENDED) {
            await this.logLoginAttempt({
                email,
                provider: client_1.AuthProviderType.GOOGLE,
                success: false,
                failureReason: 'ACCOUNT_SUSPENDED',
                userId: user.id,
                ...context
            });
            throw new http_error_1.HttpError(423, 'Account is currently suspended', 'ACCOUNT_SUSPENDED');
        }
        const freshUser = await this.getUserOrThrow(user.id);
        const response = await this.issueAuthTokens(freshUser, client_1.AuthProviderType.GOOGLE);
        await this.logLoginAttempt({
            email,
            provider: client_1.AuthProviderType.GOOGLE,
            success: true,
            userId: user.id,
            ...context
        });
        return response;
    }
    async refreshTokens(input) {
        let decoded;
        try {
            decoded = this.tokenService.verifyRefreshToken(input.refreshToken);
        }
        catch {
            throw new http_error_1.HttpError(401, 'Invalid refresh token', 'REFRESH_INVALID');
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
            throw new http_error_1.HttpError(401, 'Refresh token is not recognized', 'REFRESH_UNKNOWN');
        }
        if (authProvider.expiresAt && authProvider.expiresAt.getTime() <= Date.now()) {
            throw new http_error_1.HttpError(401, 'Refresh session expired', 'REFRESH_EXPIRED');
        }
        const storedToken = authProvider.refreshToken
            ? this.tokenService.decryptRefreshToken(authProvider.refreshToken)
            : null;
        if (!storedToken || storedToken !== input.refreshToken) {
            throw new http_error_1.HttpError(401, 'Refresh token mismatch', 'REFRESH_MISMATCH');
        }
        if (authProvider.user.status === client_1.UserStatus.SUSPENDED) {
            throw new http_error_1.HttpError(423, 'Account is currently suspended', 'ACCOUNT_SUSPENDED');
        }
        const freshUser = await this.getUserOrThrow(authProvider.user.id);
        return this.issueAuthTokens(freshUser, decoded.provider);
    }
    async logout(userId, refreshToken) {
        if (refreshToken) {
            try {
                const decoded = this.tokenService.verifyRefreshToken(refreshToken);
                if (userId && decoded.sub !== userId) {
                    throw new http_error_1.HttpError(401, 'Refresh token does not belong to the current user', 'REFRESH_INVALID');
                }
                const targetUserId = userId ?? decoded.sub;
                await this.prisma.authProvider.update({
                    where: {
                        userId_type: {
                            userId: targetUserId,
                            type: decoded.provider
                        }
                    },
                    data: {
                        refreshToken: null,
                        expiresAt: null
                    }
                });
                return;
            }
            catch (error) {
                if (error instanceof http_error_1.HttpError) {
                    throw error;
                }
                throw new http_error_1.HttpError(401, 'Invalid refresh token', 'REFRESH_INVALID');
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
    async getCurrentUser(userId) {
        const user = await this.getUserOrThrow(userId);
        return this.serializeUser(user);
    }
    async ensureGoogleProvider(userId, providerUserId) {
        await this.prisma.authProvider.upsert({
            where: {
                userId_type: {
                    userId,
                    type: client_1.AuthProviderType.GOOGLE
                }
            },
            update: {
                providerUserId,
                linkedAt: new Date()
            },
            create: {
                userId,
                type: client_1.AuthProviderType.GOOGLE,
                providerUserId
            }
        });
    }
    async createUserFromGoogle(params) {
        const normalizedEmail = normalizeEmail(params.email);
        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: normalizedEmail,
                    fullName: params.displayName,
                    role: client_1.Role.MEMBER,
                    status: client_1.UserStatus.PENDING_ONBOARDING
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
                    type: client_1.AuthProviderType.GOOGLE,
                    providerUserId: params.googleId
                }
            });
            if (params.invite) {
                await this.consumeInvite(tx, params.invite.id, user.id, normalizedEmail);
            }
            return user;
        });
    }
    async requireInviteForRegistration(inviteCode, email) {
        if (!inviteCode?.trim()) {
            throw new http_error_1.HttpError(403, 'An invite code is required to join BioHax.', 'INVITE_REQUIRED');
        }
        const normalizedCode = normalizeInviteCode(inviteCode);
        const invite = await this.prisma.membershipInvite.findUnique({ where: { code: normalizedCode } });
        if (!invite) {
            throw new http_error_1.HttpError(403, 'Invite code is invalid.', 'INVITE_INVALID');
        }
        const normalizedEmail = normalizeEmail(email);
        if (invite.email && normalizeEmail(invite.email) !== normalizedEmail) {
            throw new http_error_1.HttpError(403, 'This invite is assigned to a different email.', 'INVITE_EMAIL_MISMATCH');
        }
        if (this.isInviteExpired(invite) || invite.status === client_1.MembershipInviteStatus.EXPIRED) {
            await this.markInviteExpired(invite.id);
            throw new http_error_1.HttpError(403, 'This invite has expired.', 'INVITE_EXPIRED');
        }
        if (invite.status === client_1.MembershipInviteStatus.REVOKED) {
            throw new http_error_1.HttpError(403, 'This invite is no longer valid.', 'INVITE_REVOKED');
        }
        if (invite.status === client_1.MembershipInviteStatus.REDEEMED || invite.usedCount >= invite.maxUses) {
            await this.markInviteRedeemed(invite.id);
            throw new http_error_1.HttpError(403, 'Invite code has already been used.', 'INVITE_CONSUMED');
        }
        return invite;
    }
    async findInviteForEmail(email) {
        const normalizedEmail = normalizeEmail(email);
        const invites = await this.prisma.membershipInvite.findMany({
            where: {
                email: normalizedEmail,
                status: client_1.MembershipInviteStatus.ACTIVE
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
    async consumeInvite(tx, inviteId, userId, email) {
        const now = new Date();
        const updated = await tx.$executeRaw `
      UPDATE "MembershipInvite"
      SET "usedCount" = "usedCount" + 1,
          "lastRedeemedAt" = ${now},
          "updatedAt" = ${now}
      WHERE "id" = ${inviteId}
        AND "status" = ${client_1.MembershipInviteStatus.ACTIVE}
        AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
        AND "usedCount" < "maxUses";
    `;
        if (updated === 0) {
            throw new http_error_1.HttpError(403, 'Invite can no longer be used.', 'INVITE_CONSUMED');
        }
        await tx.membershipInviteRedemption.create({
            data: {
                inviteId,
                userId,
                email: normalizeEmail(email)
            }
        });
        const latest = await tx.membershipInvite.findUnique({ where: { id: inviteId } });
        if (latest && latest.usedCount >= latest.maxUses && latest.status !== client_1.MembershipInviteStatus.REDEEMED) {
            await tx.membershipInvite.update({
                where: { id: inviteId },
                data: { status: client_1.MembershipInviteStatus.REDEEMED }
            });
        }
    }
    isInviteExpired(invite) {
        return Boolean(invite.expiresAt && invite.expiresAt.getTime() <= Date.now());
    }
    async markInviteExpired(inviteId) {
        await this.prisma.membershipInvite
            .update({
            where: { id: inviteId },
            data: { status: client_1.MembershipInviteStatus.EXPIRED }
        })
            .catch(() => undefined);
    }
    async markInviteRedeemed(inviteId) {
        await this.prisma.membershipInvite
            .update({
            where: { id: inviteId },
            data: { status: client_1.MembershipInviteStatus.REDEEMED }
        })
            .catch(() => undefined);
    }
    async getUserOrThrow(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new http_error_1.HttpError(404, 'User not found', 'USER_NOT_FOUND');
        }
        return user;
    }
    serializeUser(user) {
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString()
        };
    }
    async issueAuthTokens(user, provider) {
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
                providerUserId: provider === client_1.AuthProviderType.EMAIL_PASSWORD ? user.email : null,
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
    async logLoginAttempt(details) {
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
        }
        catch (error) {
            console.warn('[identity] Failed to record login audit', {
                userId: details.userId,
                email: details.email,
                error: error.message
            });
        }
    }
    isUniqueConstraintError(error) {
        return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
    }
}
exports.IdentityService = IdentityService;
const defaultGoogleClient = new google_auth_library_1.OAuth2Client(env_1.default.GOOGLE_CLIENT_ID, env_1.default.GOOGLE_CLIENT_SECRET);
exports.identityService = new IdentityService(prisma_1.default, token_service_1.tokenService, defaultGoogleClient);
