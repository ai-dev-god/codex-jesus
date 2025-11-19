import { PrismaClient, WhoopIntegration } from '@prisma/client';

import env from '../src/config/env';
import { whoopTokenCrypto } from '../src/modules/wearable/token-crypto';
import { enqueueAndMaybeRunWhoopSync } from '../src/modules/wearable/whoop-sync-dispatcher';
import { WhoopTokenManager } from '../src/modules/wearable/whoop-token-manager';

const prisma = new PrismaClient();

const REFRESH_THRESHOLD_MS = Number(process.env.WHOOP_REFRESH_THRESHOLD_MS ?? 5 * 60 * 1000);

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

const tokenManager = new WhoopTokenManager(
  prisma,
  whoopTokenCrypto,
  () => new Date(),
  {
    clientId: env.WHOOP_CLIENT_ID ?? null,
    clientSecret: env.WHOOP_CLIENT_SECRET ?? null,
    refreshThresholdMs: REFRESH_THRESHOLD_MS
  }
);

const enqueueSync = async (integration: WhoopIntegration) => {
  if (!integration.whoopUserId) {
    summary.skipped += 1;
    console.warn('[whoop-sync-daemon] Missing whoopUserId for integration', { userId: integration.userId });
    return;
  }

  await enqueueAndMaybeRunWhoopSync(
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

  const { accessToken, integration: latestIntegration, refreshed } = await tokenManager.ensureAccessToken(integration);
  if (refreshed) {
    summary.refreshed += 1;
  }

  if (!accessToken) {
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

  await enqueueSync(latestIntegration);
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

