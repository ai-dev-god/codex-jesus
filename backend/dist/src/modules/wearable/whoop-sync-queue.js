"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoopSyncQueue = exports.enqueueWhoopSyncTask = exports.WHOOP_SYNC_RETRY_CONFIG = exports.WHOOP_SYNC_QUEUE = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
exports.WHOOP_SYNC_QUEUE = 'whoop-sync';
exports.WHOOP_SYNC_RETRY_CONFIG = {
    maxAttempts: 5,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 600
};
const toJsonValue = (payload) => JSON.parse(JSON.stringify(payload));
const enqueueWhoopSyncTask = async (prisma, payload, options = {}) => {
    const taskName = options.taskName ?? `whoop-sync-${payload.userId}-${Date.now()}`;
    return prisma.cloudTaskMetadata.create({
        data: {
            taskName,
            queue: exports.WHOOP_SYNC_QUEUE,
            payload: toJsonValue({
                payload,
                retry: exports.WHOOP_SYNC_RETRY_CONFIG
            }),
            scheduleTime: options.scheduleTime ?? null,
            status: 'PENDING'
        }
    });
};
exports.enqueueWhoopSyncTask = enqueueWhoopSyncTask;
exports.whoopSyncQueue = {
    queue: exports.WHOOP_SYNC_QUEUE,
    retryConfig: exports.WHOOP_SYNC_RETRY_CONFIG,
    enqueue: (payload, options) => (0, exports.enqueueWhoopSyncTask)(prisma_1.default, payload, options)
};
