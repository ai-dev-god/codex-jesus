"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoopSyncWorker = exports.createWhoopSyncWorker = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const whoop_sync_queue_1 = require("../modules/wearable/whoop-sync-queue");
const resolvePayload = (metadataPayload) => {
    if (!metadataPayload || typeof metadataPayload !== 'object') {
        return null;
    }
    const payload = metadataPayload.payload;
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const record = payload;
    const userId = typeof record.userId === 'string' ? record.userId : null;
    const whoopUserId = typeof record.whoopUserId === 'string' ? record.whoopUserId : null;
    const reason = record.reason;
    if (!userId || !whoopUserId || (reason !== 'initial-link' && reason !== 'scheduled' && reason !== 'manual-retry')) {
        return null;
    }
    return {
        userId,
        whoopUserId,
        reason
    };
};
const createWhoopSyncWorker = (deps = {}) => {
    const prisma = deps.prisma ?? prisma_1.default;
    const logger = deps.logger ?? console;
    const now = deps.now ?? (() => new Date());
    return async (taskName) => {
        const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
        if (!metadata) {
            logger.warn?.(`[whoop-sync] No task metadata found for task ${taskName}`);
            return;
        }
        const payload = resolvePayload(metadata.payload);
        logger.info?.('[whoop-sync] Dispatching wearable sync', {
            taskName,
            queue: whoop_sync_queue_1.WHOOP_SYNC_QUEUE,
            retry: whoop_sync_queue_1.WHOOP_SYNC_RETRY_CONFIG,
            payload
        });
        await prisma.cloudTaskMetadata.update({
            where: { id: metadata.id },
            data: {
                status: 'SUCCEEDED',
                attemptCount: metadata.attemptCount + 1,
                firstAttemptAt: metadata.firstAttemptAt ?? now(),
                lastAttemptAt: now()
            }
        });
    };
};
exports.createWhoopSyncWorker = createWhoopSyncWorker;
exports.whoopSyncWorker = (0, exports.createWhoopSyncWorker)();
