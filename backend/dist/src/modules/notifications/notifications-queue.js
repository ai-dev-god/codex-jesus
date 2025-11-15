"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsQueue = exports.enqueueNotificationTask = exports.NOTIFICATIONS_RETRY_CONFIG = exports.NOTIFICATIONS_QUEUE = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
exports.NOTIFICATIONS_QUEUE = 'notifications-dispatch';
exports.NOTIFICATIONS_RETRY_CONFIG = {
    maxAttempts: 5,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 900
};
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const enqueueNotificationTask = async (prisma, payload, options = {}) => {
    const taskName = options.taskName ?? `notifications-dispatch-${payload.recipient.id}-${Date.now().toString(36)}`;
    return prisma.cloudTaskMetadata.create({
        data: {
            taskName,
            queue: exports.NOTIFICATIONS_QUEUE,
            payload: toJsonValue({
                payload,
                retry: exports.NOTIFICATIONS_RETRY_CONFIG
            }),
            scheduleTime: options.scheduleTime ?? null,
            status: 'PENDING'
        }
    });
};
exports.enqueueNotificationTask = enqueueNotificationTask;
exports.notificationsQueue = {
    queue: exports.NOTIFICATIONS_QUEUE,
    retryConfig: exports.NOTIFICATIONS_RETRY_CONFIG,
    enqueue: (payload, options) => (0, exports.enqueueNotificationTask)(prisma_1.default, payload, options)
};
