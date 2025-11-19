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
const whoop_api_client_1 = require("./whoop-api.client");
const whoop_sync_dispatcher_1 = require("./whoop-sync-dispatcher");
const whoop_config_1 = require("./whoop-config");
const DEFAULT_SCOPES = ['read:recovery', 'read:cycles', 'read:profile'];
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const parseScopeList = (raw) => {
    if (!raw) {
        return null;
    }
    const scopes = raw
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    return scopes.length > 0 ? scopes : null;
};
class WhoopService {
    constructor(prisma, oauthClient, tokenCrypto, stateFactory = () => (0, node_crypto_1.randomUUID)(), now = () => new Date(), options = {}) {
        this.prisma = prisma;
        this.oauthClient = oauthClient;
        this.tokenCrypto = tokenCrypto;
        this.stateFactory = stateFactory;
        this.now = now;
        const envScopes = parseScopeList(env_1.default.WHOOP_SCOPES ?? null);
        const scopes = options.scopes ?? envScopes ?? DEFAULT_SCOPES;
        const resolvedAuthorizeUrl = options.authorizeUrl
            ? (0, whoop_config_1.normalizeAuthorizeUrl)(options.authorizeUrl)
            : whoop_config_1.whoopAuthorizeUrl;
        this.config = {
            clientId: options.clientId ?? env_1.default.WHOOP_CLIENT_ID ?? null,
            clientSecret: options.clientSecret ?? env_1.default.WHOOP_CLIENT_SECRET ?? null,
            redirectUri: options.redirectUri ?? env_1.default.WHOOP_REDIRECT_URI,
            scopes,
            authorizeUrl: resolvedAuthorizeUrl,
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
                const errorMessage = error.message || 'Unknown Whoop OAuth error';
                console.error('[Whoop] Token exchange failed:', errorMessage, {
                    codeLength: input.code?.length,
                    redirectUri: session.redirectUri,
                    state: input.state
                });
                throw new http_error_1.HttpError(502, `Unable to complete Whoop OAuth exchange: ${errorMessage}`, 'WHOOP_LINK_FAILED');
            }
            throw error;
        }
        // If user ID is not in token response, fetch it from the API (non-blocking)
        let whoopUserId = exchange.whoopUserId;
        const resolvedUserId = whoopUserId ??
            (await (async () => {
                try {
                    const apiClient = new whoop_api_client_1.WhoopApiClient();
                    const userProfile = await apiClient.getUserProfile(exchange.accessToken);
                    if (userProfile && userProfile.id) {
                        console.log('[Whoop] Fetched user ID from API:', userProfile.id);
                        return String(userProfile.id);
                    }
                    const workouts = await apiClient.listWorkouts(exchange.accessToken, { limit: 1 });
                    if (workouts.records.length > 0 && workouts.records[0].user_id) {
                        console.log('[Whoop] Fetched user ID from workouts:', workouts.records[0].user_id);
                        return String(workouts.records[0].user_id);
                    }
                }
                catch (apiError) {
                    console.warn('[Whoop] Failed to fetch user ID from API, proceeding without it:', {
                        error: apiError instanceof Error ? apiError.message : String(apiError)
                    });
                }
                return null;
            })());
        whoopUserId = resolvedUserId;
        const now = this.now();
        const expiresAt = new Date(now.getTime() + exchange.expiresIn * 1000);
        const encryptedAccess = this.tokenCrypto.encrypt(exchange.accessToken);
        const encryptedRefresh = exchange.refreshToken ? this.tokenCrypto.encrypt(exchange.refreshToken) : null;
        if (!exchange.refreshToken) {
            console.warn('[Whoop] Token exchange did not return a refresh_token. Access token will expire without automatic refresh.', {
                userId: session.userId,
                whoopUserId
            });
        }
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
                    whoopUserId: whoopUserId,
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
                    whoopUserId: whoopUserId,
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
                    whoopMemberId: whoopUserId
                }
            });
        });
        if (whoopUserId) {
            await this.scheduleInitialSync({
                userId: input.userId,
                whoopUserId: whoopUserId
            });
        }
        else {
            console.warn('[Whoop] Skipping initial sync because whoopUserId is still unknown.', {
                userId: input.userId
            });
        }
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
            await (0, whoop_sync_dispatcher_1.enqueueAndMaybeRunWhoopSync)(this.prisma, {
                userId: params.userId,
                whoopUserId: params.whoopUserId,
                reason: 'initial-link'
            }, { swallowErrors: true });
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
