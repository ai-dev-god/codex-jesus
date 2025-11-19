"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueAndMaybeRunWhoopSync = void 0;
const env_1 = __importDefault(require("../../config/env"));
const whoop_sync_1 = require("../../workers/whoop-sync");
const whoop_sync_queue_1 = require("./whoop-sync-queue");
const shouldRunInline = env_1.default.WHOOP_SYNC_INLINE;
const logError = (message, context) => {
    if (process.env.NODE_ENV === 'test') {
        return;
    }
    console.error(message, context);
};
const enqueueAndMaybeRunWhoopSync = async (prisma, payload, options = {}) => {
    const { swallowErrors = false, ...enqueueOptions } = options;
    const metadata = await (0, whoop_sync_queue_1.enqueueWhoopSyncTask)(prisma, payload, enqueueOptions);
    if (!shouldRunInline) {
        return metadata;
    }
    try {
        await prisma.cloudTaskMetadata.update({
            where: { id: metadata.id },
            data: {
                status: 'DISPATCHED'
            }
        });
    }
    catch (error) {
        logError('[whoop-sync-inline] Failed to mark task as dispatched', {
            taskName: metadata.taskName,
            error: error instanceof Error ? error.message : String(error)
        });
        if (!swallowErrors) {
            throw error instanceof Error ? error : new Error(String(error));
        }
        return metadata;
    }
    try {
        await (0, whoop_sync_1.whoopSyncWorker)(metadata.taskName);
    }
    catch (error) {
        logError('[whoop-sync-inline] Worker execution failed', {
            taskName: metadata.taskName,
            error: error instanceof Error ? error.message : String(error)
        });
        if (!swallowErrors) {
            throw error instanceof Error ? error : new Error(String(error));
        }
    }
    return metadata;
};
exports.enqueueAndMaybeRunWhoopSync = enqueueAndMaybeRunWhoopSync;
