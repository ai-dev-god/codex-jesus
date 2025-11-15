"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationWorker = exports.createNotificationWorker = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const alerting_1 = require("../modules/observability-ops/alerting");
const notifications_queue_1 = require("../modules/notifications/notifications-queue");
const resend_client_1 = require("../modules/notifications/resend-client");
const templates_1 = require("../modules/notifications/templates");
const parseNotificationPayload = (metadataPayload) => {
    if (!metadataPayload || typeof metadataPayload !== 'object') {
        return null;
    }
    const outer = metadataPayload;
    const inner = outer.payload;
    if (!inner || typeof inner !== 'object') {
        return null;
    }
    const payload = inner;
    const type = typeof payload.type === 'string' ? payload.type : null;
    const channel = typeof payload.channel === 'string' ? payload.channel : 'email';
    const recipientRecord = payload.recipient;
    const data = payload.data;
    if (!type ||
        channel !== 'email' ||
        !recipientRecord ||
        typeof recipientRecord !== 'object' ||
        !data ||
        typeof data !== 'object') {
        return null;
    }
    const recipientObj = recipientRecord;
    const recipientId = typeof recipientObj.id === 'string' ? recipientObj.id : null;
    const recipientEmail = typeof recipientObj.email === 'string' ? recipientObj.email : null;
    const displayName = typeof recipientObj.displayName === 'string' ? recipientObj.displayName : '';
    if (!recipientId || !recipientEmail) {
        return null;
    }
    return {
        type,
        channel: 'email',
        recipient: {
            id: recipientId,
            email: recipientEmail,
            displayName
        },
        data: data
    };
};
const resolveMaxAttempts = (metadata) => {
    const payload = metadata.payload;
    if (!payload || typeof payload !== 'object') {
        return notifications_queue_1.NOTIFICATIONS_RETRY_CONFIG.maxAttempts;
    }
    const record = payload;
    const retry = record.retry;
    if (!retry || typeof retry !== 'object') {
        return notifications_queue_1.NOTIFICATIONS_RETRY_CONFIG.maxAttempts;
    }
    const retryRecord = retry;
    const raw = retryRecord.maxAttempts;
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : notifications_queue_1.NOTIFICATIONS_RETRY_CONFIG.maxAttempts;
};
const createNotificationWorker = (deps = {}) => {
    const prisma = deps.prisma ?? prisma_1.default;
    const resend = deps.resend ?? resend_client_1.resendEmailClient;
    const logger = deps.logger ?? console;
    const alertClient = deps.alerting ?? alerting_1.alerting;
    const now = deps.now ?? (() => new Date());
    return async (taskName) => {
        const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
        if (!metadata) {
            logger.warn?.(`[notifications] No task metadata found for ${taskName}`);
            return;
        }
        const attemptTimestamp = now();
        const attemptCount = metadata.attemptCount + 1;
        const maxAttempts = resolveMaxAttempts(metadata);
        const payload = parseNotificationPayload(metadata.payload);
        if (!payload) {
            logger.error?.('[notifications] Task payload missing required fields', {
                taskName,
                payload: metadata.payload
            });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'FAILED',
                    attemptCount,
                    firstAttemptAt: metadata.firstAttemptAt ?? attemptTimestamp,
                    lastAttemptAt: attemptTimestamp,
                    errorMessage: 'Notification payload is invalid'
                }
            });
            if (attemptCount >= maxAttempts) {
                await alertClient.notify('notifications.dead_letter', {
                    taskName,
                    reason: 'invalid-payload'
                });
            }
            return;
        }
        const email = (0, templates_1.buildNotificationEmail)(payload);
        try {
            await resend.sendEmail({
                to: payload.recipient.email,
                subject: email.subject,
                html: email.html,
                text: email.text,
                from: email.from,
                tags: email.tags
            });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'SUCCEEDED',
                    attemptCount,
                    firstAttemptAt: metadata.firstAttemptAt ?? attemptTimestamp,
                    lastAttemptAt: attemptTimestamp,
                    errorMessage: null
                }
            });
            logger.info?.('[notifications] Delivered notification', {
                type: payload.type,
                recipientId: payload.recipient.id,
                taskName
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown notification failure';
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'FAILED',
                    attemptCount,
                    firstAttemptAt: metadata.firstAttemptAt ?? attemptTimestamp,
                    lastAttemptAt: attemptTimestamp,
                    errorMessage: message
                }
            });
            logger.error?.('[notifications] Failed to deliver notification', {
                type: payload.type,
                recipientId: payload.recipient.id,
                taskName,
                error: message
            });
            if (attemptCount >= maxAttempts) {
                await alertClient.notify('notifications.dead_letter', {
                    taskName,
                    type: payload.type,
                    recipientId: payload.recipient.id,
                    error: message
                });
            }
        }
    };
};
exports.createNotificationWorker = createNotificationWorker;
exports.notificationWorker = (0, exports.createNotificationWorker)();
