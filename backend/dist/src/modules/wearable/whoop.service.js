"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoopService = exports.WhoopService = void 0;
const node_crypto_1 = require("node:crypto");
const env_1 = __importDefault(require("../../config/env"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const dashboard_service_1 = require("../dashboard/dashboard.service");
const token_crypto_1 = require("./token-crypto");
const oauth_client_1 = require("./oauth-client");
const whoop_sync_queue_1 = require("./whoop-sync-queue");
const DEFAULT_AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const DEFAULT_SCOPES = ['offline_access', 'read:recovery', 'read:cycles', 'read:profile'];
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
class WhoopService {
    constructor(prisma, oauthClient, tokenCrypto, stateFactory = () => (0, node_crypto_1.randomUUID)(), now = () => new Date(), options = {}) {
        this.prisma = prisma;
        this.oauthClient = oauthClient;
        this.tokenCrypto = tokenCrypto;
        this.stateFactory = stateFactory;
        this.now = now;
        const scopes = options.scopes ?? DEFAULT_SCOPES;
        this.config = {
            clientId: options.clientId ?? env_1.default.WHOOP_CLIENT_ID ?? null,
            clientSecret: options.clientSecret ?? env_1.default.WHOOP_CLIENT_SECRET ?? null,
            redirectUri: options.redirectUri ?? env_1.default.WHOOP_REDIRECT_URI,
            scopes,
            authorizeUrl: options.authorizeUrl ?? DEFAULT_AUTHORIZE_URL,
            stateTtlMs: options.stateTtlMs ?? DEFAULT_STATE_TTL_MS,
            tokenKeyId: options.tokenKeyId ?? env_1.default.WHOOP_TOKEN_KEY_ID
        };
    }
    async getStatus(userId) {
        const [integration, session] = await Promise.all([
            this.prisma.whoopIntegration.findUnique({ where: { userId } }),
            this.prisma.whoopLinkSession.findFirst({
                where: {
                    userId,
                    cancelledAt: null,
                    completedAt: null
                },
                orderBy: { createdAt: 'desc' }
            })
        ]);
        const now = this.now();
        const activeSession = session && session.expiresAt > now ? session : session ? await this.markSessionExpired(session) : null;
        return this.toStatus(integration, activeSession);
    }
    async initiateLink(userId) {
        this.ensureConfigured();
        await this.prisma.$transaction(async (tx) => {
            const integration = await tx.whoopIntegration.findUnique({ where: { userId } });
            if (integration && integration.syncStatus === 'ACTIVE' && integration.accessToken) {
                throw new http_error_1.HttpError(409, 'A Whoop integration is already active for this account.', 'WHOOP_ALREADY_LINKED');
            }
            const now = this.now();
            const expiresAt = new Date(now.getTime() + this.config.stateTtlMs);
            const state = this.stateFactory();
            await tx.whoopLinkSession.updateMany({
                where: {
                    userId,
                    cancelledAt: null,
                    completedAt: null
                },
                data: {
                    cancelledAt: now
                }
            });
            await tx.whoopLinkSession.create({
                data: {
                    userId,
                    state,
                    redirectUri: this.config.redirectUri,
                    scope: this.config.scopes,
                    expiresAt
                }
            });
        });
        return this.getStatus(userId);
    }
    async completeLink(input) {
        this.ensureConfigured();
        const session = await this.prisma.whoopLinkSession.findUnique({ where: { state: input.state } });
        if (!session || session.userId !== input.userId || session.cancelledAt || session.completedAt) {
            throw new http_error_1.HttpError(422, 'Link session is invalid or expired.', 'WHOOP_LINK_INVALID');
        }
        if (session.expiresAt <= this.now()) {
            await this.markSessionExpired(session);
            throw new http_error_1.HttpError(422, 'Link session is invalid or expired.', 'WHOOP_LINK_INVALID');
        }
        let exchange;
        try {
            exchange = await this.oauthClient.exchangeCode({
                code: input.code,
                redirectUri: session.redirectUri
            });
        }
        catch (error) {
            if (error instanceof oauth_client_1.WhoopOAuthError) {
                throw new http_error_1.HttpError(502, 'Unable to complete Whoop OAuth exchange.', 'WHOOP_LINK_FAILED');
            }
            throw error;
        }
        const now = this.now();
        const expiresAt = new Date(now.getTime() + exchange.expiresIn * 1000);
        const encryptedAccess = this.tokenCrypto.encrypt(exchange.accessToken);
        const encryptedRefresh = this.tokenCrypto.encrypt(exchange.refreshToken);
        await this.prisma.$transaction(async (tx) => {
            await tx.whoopLinkSession.update({
                where: { id: session.id },
                data: {
                    completedAt: now
                }
            });
            await tx.whoopLinkSession.updateMany({
                where: {
                    userId: session.userId,
                    cancelledAt: null,
                    completedAt: null,
                    id: { not: session.id }
                },
                data: {
                    cancelledAt: now
                }
            });
            await tx.whoopIntegration.upsert({
                where: { userId: session.userId },
                update: {
                    whoopUserId: exchange.whoopUserId,
                    accessToken: encryptedAccess,
                    refreshToken: encryptedRefresh,
                    expiresAt,
                    scope: exchange.scope,
                    syncStatus: 'ACTIVE',
                    tokenKeyId: this.config.tokenKeyId,
                    tokenRotatedAt: now,
                    lastSyncedAt: null,
                    updatedAt: now
                },
                create: {
                    userId: session.userId,
                    whoopUserId: exchange.whoopUserId,
                    accessToken: encryptedAccess,
                    refreshToken: encryptedRefresh,
                    expiresAt,
                    scope: exchange.scope,
                    syncStatus: 'ACTIVE',
                    tokenKeyId: this.config.tokenKeyId,
                    tokenRotatedAt: now,
                    lastSyncedAt: null
                }
            });
            await tx.user.update({
                where: { id: session.userId },
                data: {
                    whoopMemberId: exchange.whoopUserId
                }
            });
        });
        await this.scheduleInitialSync({
            userId: input.userId,
            whoopUserId: exchange.whoopUserId
        });
        await this.invalidateDashboard(input.userId);
        return this.getStatus(input.userId);
    }
    async unlink(userId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.whoopIntegration
                .delete({
                where: { userId }
            })
                .catch((error) => {
                if (error.code !== 'P2025') {
                    throw error;
                }
            });
            await tx.user.update({
                where: { id: userId },
                data: { whoopMemberId: null }
            });
            await tx.whoopLinkSession.updateMany({
                where: {
                    userId,
                    cancelledAt: null,
                    completedAt: null
                },
                data: {
                    cancelledAt: this.now()
                }
            });
        });
        await this.invalidateDashboard(userId);
    }
    async handleLinkRequest(userId, payload) {
        if (payload.authorizationCode && payload.state) {
            return this.completeLink({
                userId,
                code: payload.authorizationCode,
                state: payload.state
            });
        }
        return this.initiateLink(userId);
    }
    async markSessionExpired(session) {
        if (session.cancelledAt || session.completedAt) {
            return null;
        }
        await this.prisma.whoopLinkSession.update({
            where: { id: session.id },
            data: { cancelledAt: this.now() }
        });
        return null;
    }
    toStatus(integration, session) {
        const linked = Boolean(integration && integration.syncStatus === 'ACTIVE' && integration.accessToken);
        const syncStatus = integration?.syncStatus ?? 'PENDING';
        const linkable = !linked && Boolean(this.config.clientId);
        const linkUrl = linkable && session ? this.buildAuthorizeUrl(session) : null;
        return {
            linked,
            linkUrl,
            state: linkable && session ? session.state : null,
            expiresAt: linkable && session ? session.expiresAt.toISOString() : null,
            lastSyncAt: integration?.lastSyncedAt ? integration.lastSyncedAt.toISOString() : null,
            syncStatus
        };
    }
    buildAuthorizeUrl(session) {
        const url = new URL(this.config.authorizeUrl);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', this.config.clientId ?? '');
        url.searchParams.set('redirect_uri', session.redirectUri);
        url.searchParams.set('scope', this.config.scopes.join(' '));
        url.searchParams.set('state', session.state);
        return url.toString();
    }
    ensureConfigured() {
        if (!this.config.clientId || !this.config.clientSecret) {
            throw new http_error_1.HttpError(503, 'Whoop integration is not configured for this environment.', 'WHOOP_NOT_CONFIGURED');
        }
    }
    async scheduleInitialSync(params) {
        try {
            await (0, whoop_sync_queue_1.enqueueWhoopSyncTask)(this.prisma, {
                userId: params.userId,
                whoopUserId: params.whoopUserId,
                reason: 'initial-link'
            });
        }
        catch (error) {
            console.warn('[whoop-service] Failed to enqueue whoop sync task', {
                userId: params.userId,
                error: error instanceof Error ? error.message : error
            });
        }
    }
    async invalidateDashboard(userId) {
        try {
            await dashboard_service_1.dashboardService.invalidateUser(userId);
        }
        catch (error) {
            // Avoid blocking wearable flows when cache invalidation fails.
            console.warn('[whoop] Failed to invalidate dashboard cache', error);
        }
    }
}
exports.WhoopService = WhoopService;
exports.whoopService = new WhoopService(prisma_1.default, oauth_client_1.whoopOAuthClient, token_crypto_1.whoopTokenCrypto, () => (0, node_crypto_1.randomUUID)(), () => new Date());
