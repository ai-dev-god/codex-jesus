import type { PrismaClient, WhoopIntegration, WhoopLinkSession, WhoopSyncStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import { dashboardService } from '../dashboard/dashboard.service';
import type { TokenCrypto } from './token-crypto';
import { whoopTokenCrypto } from './token-crypto';
import type { WhoopOAuthClient } from './oauth-client';
import { WhoopOAuthError, whoopOAuthClient } from './oauth-client';
import { WhoopApiClient } from './whoop-api.client';
import { enqueueWhoopSyncTask } from './whoop-sync-queue';
import { normalizeAuthorizeUrl, whoopAuthorizeUrl } from './whoop-config';

const DEFAULT_SCOPES = ['read:recovery', 'read:cycles', 'read:profile'];
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

const parseScopeList = (raw?: string | null): string[] | null => {
  if (!raw) {
    return null;
  }

  const scopes = raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return scopes.length > 0 ? scopes : null;
};

type WhoopLinkStatus = {
  linked: boolean;
  linkUrl: string | null;
  state: string | null;
  expiresAt: string | null;
  lastSyncAt: string | null;
  syncStatus: WhoopSyncStatus;
};

type WhoopLinkRequest = {
  authorizationCode?: string;
  state?: string;
};

type WhoopCompletionInput = {
  userId: string;
  code: string;
  state: string;
};

type WhoopServiceOptions = Partial<{
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string;
  scopes: string[];
  authorizeUrl: string;
  stateTtlMs: number;
  tokenKeyId: string;
}>;

export class WhoopService {
  private readonly config: Required<WhoopServiceOptions>;
  constructor(
    private readonly prisma: PrismaClient,
    private readonly oauthClient: WhoopOAuthClient,
    private readonly tokenCrypto: TokenCrypto,
    private readonly stateFactory: () => string = () => randomUUID(),
    private readonly now: () => Date = () => new Date(),
    options: WhoopServiceOptions = {}
  ) {
    const envScopes = parseScopeList(env.WHOOP_SCOPES ?? null);
    const scopes = options.scopes ?? envScopes ?? DEFAULT_SCOPES;
    const resolvedAuthorizeUrl = options.authorizeUrl
      ? normalizeAuthorizeUrl(options.authorizeUrl)
      : whoopAuthorizeUrl;
    this.config = {
      clientId: options.clientId ?? env.WHOOP_CLIENT_ID ?? null,
      clientSecret: options.clientSecret ?? env.WHOOP_CLIENT_SECRET ?? null,
      redirectUri: options.redirectUri ?? env.WHOOP_REDIRECT_URI,
      scopes,
      authorizeUrl: resolvedAuthorizeUrl,
      stateTtlMs: options.stateTtlMs ?? DEFAULT_STATE_TTL_MS,
      tokenKeyId: options.tokenKeyId ?? env.WHOOP_TOKEN_KEY_ID
    };
  }

  async getStatus(userId: string): Promise<WhoopLinkStatus> {
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
    const activeSession =
      session && session.expiresAt > now ? session : session ? await this.markSessionExpired(session) : null;

    return this.toStatus(integration, activeSession);
  }

  async initiateLink(userId: string): Promise<WhoopLinkStatus> {
    this.ensureConfigured();

    await this.prisma.$transaction(async (tx) => {
      const integration = await tx.whoopIntegration.findUnique({ where: { userId } });
      if (integration && integration.syncStatus === 'ACTIVE' && integration.accessToken) {
        throw new HttpError(409, 'A Whoop integration is already active for this account.', 'WHOOP_ALREADY_LINKED');
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

  async completeLink(input: WhoopCompletionInput): Promise<WhoopLinkStatus> {
    this.ensureConfigured();

    const session = await this.prisma.whoopLinkSession.findUnique({ where: { state: input.state } });
    if (!session || session.userId !== input.userId || session.cancelledAt || session.completedAt) {
      throw new HttpError(422, 'Link session is invalid or expired.', 'WHOOP_LINK_INVALID');
    }

    if (session.expiresAt <= this.now()) {
      await this.markSessionExpired(session);
      throw new HttpError(422, 'Link session is invalid or expired.', 'WHOOP_LINK_INVALID');
    }

    let exchange;
    try {
      exchange = await this.oauthClient.exchangeCode({
        code: input.code,
        redirectUri: session.redirectUri
      });
    } catch (error) {
      if (error instanceof WhoopOAuthError) {
        const errorMessage = error.message || 'Unknown Whoop OAuth error';
        console.error('[Whoop] Token exchange failed:', errorMessage, {
          codeLength: input.code?.length,
          redirectUri: session.redirectUri,
          state: input.state
        });
        throw new HttpError(502, `Unable to complete Whoop OAuth exchange: ${errorMessage}`, 'WHOOP_LINK_FAILED');
      }
      throw error;
    }

    // If user ID is not in token response, fetch it from the API (non-blocking)
    let whoopUserId = exchange.whoopUserId;
    const resolvedUserId =
      whoopUserId ??
      (await (async () => {
        try {
          const apiClient = new WhoopApiClient();
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
        } catch (apiError) {
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
    } else {
      console.warn('[Whoop] Skipping initial sync because whoopUserId is still unknown.', {
        userId: input.userId
      });
    }

    await this.invalidateDashboard(input.userId);

    return this.getStatus(input.userId);
  }

  async unlink(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.whoopIntegration
        .delete({
          where: { userId }
        })
        .catch((error: unknown) => {
          if ((error as { code?: string }).code !== 'P2025') {
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

  async handleLinkRequest(userId: string, payload: WhoopLinkRequest): Promise<WhoopLinkStatus> {
    if (payload.authorizationCode && payload.state) {
      return this.completeLink({
        userId,
        code: payload.authorizationCode,
        state: payload.state
      });
    }

    return this.initiateLink(userId);
  }

  private async markSessionExpired(session: WhoopLinkSession): Promise<WhoopLinkSession | null> {
    if (session.cancelledAt || session.completedAt) {
      return null;
    }

    await this.prisma.whoopLinkSession.update({
      where: { id: session.id },
      data: { cancelledAt: this.now() }
    });

    return null;
  }

  private toStatus(integration: WhoopIntegration | null, session: WhoopLinkSession | null): WhoopLinkStatus {
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

  private buildAuthorizeUrl(session: WhoopLinkSession): string {
    const url = new URL(this.config.authorizeUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId ?? '');
    url.searchParams.set('redirect_uri', session.redirectUri);
    url.searchParams.set('scope', this.config.scopes.join(' '));
    url.searchParams.set('state', session.state);
    return url.toString();
  }

  private ensureConfigured(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new HttpError(503, 'Whoop integration is not configured for this environment.', 'WHOOP_NOT_CONFIGURED');
    }
  }

  private async scheduleInitialSync(params: { userId: string; whoopUserId: string }): Promise<void> {
    try {
      await enqueueWhoopSyncTask(this.prisma, {
        userId: params.userId,
        whoopUserId: params.whoopUserId,
        reason: 'initial-link'
      });
    } catch (error) {
      console.warn('[whoop-service] Failed to enqueue whoop sync task', {
        userId: params.userId,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  private async invalidateDashboard(userId: string): Promise<void> {
    try {
      await dashboardService.invalidateUser(userId);
    } catch (error) {
      // Avoid blocking wearable flows when cache invalidation fails.
      console.warn('[whoop] Failed to invalidate dashboard cache', error);
    }
  }
}

export const whoopService = new WhoopService(
  prismaClient,
  whoopOAuthClient,
  whoopTokenCrypto,
  () => randomUUID(),
  () => new Date()
);
