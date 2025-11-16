"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const env_1 = __importDefault(require("../src/config/env"));
const token_crypto_1 = require("../src/modules/wearable/token-crypto");
const whoop_sync_queue_1 = require("../src/modules/wearable/whoop-sync-queue");
const whoop_token_manager_1 = require("../src/modules/wearable/whoop-token-manager");
const prisma = new client_1.PrismaClient();
const REFRESH_THRESHOLD_MS = Number(process.env.WHOOP_REFRESH_THRESHOLD_MS ?? 5 * 60 * 1000);
const summary = {
    processed: 0,
    refreshed: 0,
    scheduled: 0,
    skipped: 0,
    failures: 0
};
const tokenManager = new whoop_token_manager_1.WhoopTokenManager(prisma, token_crypto_1.whoopTokenCrypto, () => new Date(), {
    clientId: env_1.default.WHOOP_CLIENT_ID ?? null,
    clientSecret: env_1.default.WHOOP_CLIENT_SECRET ?? null,
    refreshThresholdMs: REFRESH_THRESHOLD_MS
});
const enqueueSync = async (integration) => {
    if (!integration.whoopUserId) {
        summary.skipped += 1;
        console.warn('[whoop-sync-daemon] Missing whoopUserId for integration', { userId: integration.userId });
        return;
    }
    await (0, whoop_sync_queue_1.enqueueWhoopSyncTask)(prisma, {
        userId: integration.userId,
        whoopUserId: integration.whoopUserId,
        reason: 'scheduled'
    }, {
        taskName: `whoop-sync-${integration.userId}-${Date.now()}`
    });
    summary.scheduled += 1;
};
const processIntegration = async (integration) => {
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
        }
        catch (error) {
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
