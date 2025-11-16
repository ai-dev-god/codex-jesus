import type { PrismaClient, WhoopIntegration } from '@prisma/client';

import env from '../../config/env';
import type { TokenCrypto } from './token-crypto';

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const DEFAULT_REFRESH_THRESHOLD_MS = Number(process.env.WHOOP_REFRESH_THRESHOLD_MS ?? 5 * 60 * 1000);

const toStringArray = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  return [];
};

type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
  integration: WhoopIntegration;
};

type WhoopTokenManagerOptions = Partial<{
  clientId: string | null;
  clientSecret: string | null;
  refreshThresholdMs: number;
}>;

export class WhoopTokenManager {
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly refreshThresholdMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenCrypto: TokenCrypto,
    private readonly now: () => Date = () => new Date(),
    options: WhoopTokenManagerOptions = {}
  ) {
    this.clientId = options.clientId ?? env.WHOOP_CLIENT_ID ?? null;
    this.clientSecret = options.clientSecret ?? env.WHOOP_CLIENT_SECRET ?? null;
    this.refreshThresholdMs = options.refreshThresholdMs ?? DEFAULT_REFRESH_THRESHOLD_MS;
  }

  decryptToken(value: string | null): string | null {
    if (!value) {
      return null;
    }

    return this.tokenCrypto.decrypt(value);
  }

  shouldRefresh(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return true;
    }

    return expiresAt.getTime() - this.now().getTime() <= this.refreshThresholdMs;
  }

  async ensureAccessToken(
    integration: WhoopIntegration
  ): Promise<{ accessToken: string | null; integration: WhoopIntegration; refreshed: boolean }> {
    const refreshToken = this.decryptToken(integration.refreshToken ?? null);
    if (!refreshToken) {
      return { accessToken: null, integration, refreshed: false };
    }

    let accessToken = this.decryptToken(integration.accessToken ?? null);
    let currentIntegration = integration;
    let refreshed = false;

    if (!accessToken || this.shouldRefresh(integration.expiresAt)) {
      const refreshResult = await this.refreshTokens(integration, refreshToken);
      accessToken = refreshResult.accessToken;
      currentIntegration = refreshResult.integration;
      refreshed = true;
    }

    return { accessToken, integration: currentIntegration, refreshed };
  }

  private async refreshTokens(integration: WhoopIntegration, refreshToken: string): Promise<RefreshResult> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('WHOOP OAuth credentials are not configured');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const message = await response.text().catch(() => null);
      throw new Error(
        `Whoop token refresh failed with status ${response.status}${message ? `: ${message.substring(0, 200)}` : ''}`
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
    const nextRefreshToken =
      typeof payload.refresh_token === 'string' && payload.refresh_token.length > 0 ? payload.refresh_token : refreshToken;
    const expiresInRaw = payload.expires_in;
    const expiresIn =
      typeof expiresInRaw === 'number'
        ? expiresInRaw
        : typeof expiresInRaw === 'string'
          ? Number.parseInt(expiresInRaw, 10)
          : NaN;
    const scope = toStringArray(payload.scope);

    if (!accessToken || !Number.isFinite(expiresIn)) {
      throw new Error('Whoop token refresh returned an invalid payload');
    }

    const expiresAt = new Date(this.now().getTime() + expiresIn * 1000);
    const encryptedAccess = this.tokenCrypto.encrypt(accessToken);
    const encryptedRefresh = this.tokenCrypto.encrypt(nextRefreshToken);

    const updatedIntegration = await this.prisma.whoopIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        scope: scope.length > 0 ? scope : integration.scope,
        tokenRotatedAt: this.now(),
        syncStatus: 'ACTIVE',
        updatedAt: this.now()
      }
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresAt,
      scope: scope.length > 0 ? scope : integration.scope,
      integration: updatedIntegration
    };
  }
}

