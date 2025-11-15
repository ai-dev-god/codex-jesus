import { PrismaClient, WhoopIntegration } from '@prisma/client';

import env from '../src/config/env';
import { whoopTokenCrypto } from '../src/modules/wearable/token-crypto';
import { enqueueWhoopSyncTask } from '../src/modules/wearable/whoop-sync-queue';

const prisma = new PrismaClient();

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const REFRESH_THRESHOLD_MS = Number(process.env.WHOOP_REFRESH_THRESHOLD_MS ?? 5 * 60 * 1000);

type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
};

type Summary = {
  processed: number;
  refreshed: number;
  scheduled: number;
  skipped: number;
  failures: number;
};

const summary: Summary = {
  processed: 0,
  refreshed: 0,
  scheduled: 0,
  skipped: 0,
  failures: 0
};

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

const decryptToken = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  return whoopTokenCrypto.decrypt(value);
};

const refreshTokens = async (integration: WhoopIntegration, refreshToken: string): Promise<RefreshResult> => {
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) {
    throw new Error('WHOOP_CLIENT_ID or WHOOP_CLIENT_SECRET is not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.WHOOP_CLIENT_ID,
    client_secret: env.WHOOP_CLIENT_SECRET
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
  const nextRefresh =
    typeof payload.refresh_token === 'string' && payload.refresh_token.length > 0
      ? payload.refresh_token
      : refreshToken;
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

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const encryptedAccess = whoopTokenCrypto.encrypt(accessToken);
  const encryptedRefresh = whoopTokenCrypto.encrypt(nextRefresh);

  await prisma.whoopIntegration.update({
    where: { id: integration.id },
    data: {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt,
      scope: scope.length > 0 ? scope : integration.scope,
      tokenRotatedAt: new Date(),
      syncStatus: 'ACTIVE'
    }
  });

  summary.refreshed += 1;

  return {
    accessToken,
    refreshToken: nextRefresh,
    expiresAt,
    scope: scope.length > 0 ? scope : integration.scope
  };
};

const needsRefresh = (expiresAt: Date | null): boolean => {
  if (!expiresAt) {
    return true;
  }

  return expiresAt.getTime() - Date.now() <= REFRESH_THRESHOLD_MS;
};

const enqueueSync = async (integration: WhoopIntegration) => {
  if (!integration.whoopUserId) {
    summary.skipped += 1;
    console.warn('[whoop-sync-daemon] Missing whoopUserId for integration', { userId: integration.userId });
    return;
  }

  await enqueueWhoopSyncTask(
    prisma,
    {
      userId: integration.userId,
      whoopUserId: integration.whoopUserId,
      reason: 'scheduled'
    },
    {
      taskName: `whoop-sync-${integration.userId}-${Date.now()}`
    }
  );

  summary.scheduled += 1;
};

const processIntegration = async (integration: WhoopIntegration): Promise<void> => {
  summary.processed += 1;

  const refreshToken = decryptToken(integration.refreshToken ?? null);

  if (!refreshToken) {
    summary.skipped += 1;
    console.warn('[whoop-sync-daemon] Missing refresh token; marking integration as pending', {
      userId: integration.userId
    });
    await prisma.whoopIntegration.update({
      where: { id: integration.id },
      data: {
        syncStatus: 'PENDING'
      }
    });
    return;
  }

  let accessToken = decryptToken(integration.accessToken ?? null);

  if (needsRefresh(integration.expiresAt) || !accessToken) {
    const refreshed = await refreshTokens(integration, refreshToken);
    accessToken = refreshed.accessToken;
  }

  if (!accessToken) {
    summary.skipped += 1;
    console.warn('[whoop-sync-daemon] Refresh did not return access token', { userId: integration.userId });
    return;
  }

  await enqueueSync(integration);
};

async function main() {
  console.info('[whoop-sync-daemon] Starting scheduled sync pass');

  const integrations = await prisma.whoopIntegration.findMany({
    where: {
      syncStatus: 'ACTIVE'
    }
  });

  if (integrations.length === 0) {
    console.info('[whoop-sync-daemon] No active Whoop integrations found');
    return;
  }

  for (const integration of integrations) {
    try {
      await processIntegration(integration);
    } catch (error) {
      summary.failures += 1;
      console.error('[whoop-sync-daemon] Failed to process integration', {
        userId: integration.userId,
        error: error instanceof Error ? error.message : error
      });
      await prisma.whoopIntegration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'PENDING'
        }
      });
    }
  }
}

main()
  .catch((error) => {
    console.error('[whoop-sync-daemon] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.info('[whoop-sync-daemon] Summary', summary);
    await prisma.$disconnect();
  });

