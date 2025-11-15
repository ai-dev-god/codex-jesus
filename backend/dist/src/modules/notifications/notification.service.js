"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = exports.NotificationService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const notifications_queue_1 = require("./notifications-queue");
const RATE_LIMITS = {
    INSIGHT_ALERT: { limit: 3, windowMinutes: 60 },
    STREAK_NUDGE: { limit: 2, windowMinutes: 120 },
    MODERATION_NOTICE: { limit: 5, windowMinutes: 1440 },
    ONBOARDING_WELCOME: { limit: 1, windowMinutes: 1440 },
    COMMUNITY_EVENT: { limit: 4, windowMinutes: 1440 }
};
const parseSummary = (raw) => {
    if (!raw.payload || typeof raw.payload !== 'object') {
        return { type: null, recipientId: null };
    }
    const outer = raw.payload;
    const inner = outer.payload;
    if (!inner || typeof inner !== 'object') {
        return { type: null, recipientId: null };
    }
    const payload = inner;
    const type = typeof payload.type === 'string' ? payload.type : null;
    const recipientRecord = payload.recipient;
    const recipientId = recipientRecord && typeof recipientRecord === 'object'
        ? (() => {
            const id = recipientRecord.id;
            return typeof id === 'string' ? id : null;
        })()
        : null;
    return { type, recipientId };
};
class NotificationService {
    constructor(prisma, options = {}) {
        this.prisma = prisma;
        this.now = options.now ?? (() => new Date());
        this.enqueue = options.enqueue ?? notifications_queue_1.enqueueNotificationTask;
    }
    async resolveRecipient(recipientId) {
        const user = await this.prisma.user.findUnique({
            where: { id: recipientId },
            include: { profile: true }
        });
        if (!user) {
            throw new http_error_1.HttpError(404, 'Notification recipient was not found.', 'NOTIFICATION_RECIPIENT_NOT_FOUND', { recipientId });
        }
        const displayName = user.profile?.displayName ?? user.email;
        return {
            id: user.id,
            email: user.email,
            displayName
        };
    }
    async enforceRateLimit(recipientId, type) {
        const config = RATE_LIMITS[type];
        if (!config) {
            return;
        }
        const windowStart = new Date(this.now().getTime() - config.windowMinutes * 60 * 1000);
        const recent = await this.prisma.cloudTaskMetadata.findMany({
            where: {
                queue: notifications_queue_1.NOTIFICATIONS_QUEUE,
                createdAt: {
                    gte: windowStart
                }
            },
            select: {
                payload: true
            }
        });
        let count = 0;
        for (const record of recent) {
            const summary = parseSummary(record);
            if (summary.type === type && summary.recipientId === recipientId) {
                count += 1;
            }
        }
        if (count >= config.limit) {
            throw new http_error_1.HttpError(429, 'Notification rate limit exceeded.', 'NOTIFICATION_RATE_LIMITED', {
                type,
                recipientId,
                limit: config.limit,
                windowMinutes: config.windowMinutes
            });
        }
    }
    toScheduleOptions(options) {
        return {
            scheduleTime: options.sendAt ?? null
        };
    }
    async scheduleInsightAlert(actorId, input) {
        const recipient = await this.resolveRecipient(input.recipientId);
        await this.enforceRateLimit(recipient.id, 'INSIGHT_ALERT');
        const payload = {
            type: 'INSIGHT_ALERT',
            channel: 'email',
            recipient,
            data: {
                insightId: input.insightId,
                insightTitle: input.insightTitle,
                summary: input.summary,
                triggeredAt: this.now().toISOString(),
                triggeredBy: { id: actorId }
            }
        };
        return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
    }
    async scheduleStreakNudge(actorId, input) {
        const recipient = await this.resolveRecipient(input.recipientId);
        await this.enforceRateLimit(recipient.id, 'STREAK_NUDGE');
        const payload = {
            type: 'STREAK_NUDGE',
            channel: 'email',
            recipient,
            data: {
                streakType: input.streakType,
                currentStreak: input.currentStreak,
                triggeredAt: this.now().toISOString(),
                triggeredBy: { id: actorId }
            }
        };
        return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
    }
    async scheduleModerationNotice(actorId, input) {
        const recipient = await this.resolveRecipient(input.recipientId);
        await this.enforceRateLimit(recipient.id, 'MODERATION_NOTICE');
        const payload = {
            type: 'MODERATION_NOTICE',
            channel: 'email',
            recipient,
            data: {
                flagId: input.flagId,
                status: input.status,
                reason: input.reason,
                triggeredAt: this.now().toISOString(),
                triggeredBy: { id: actorId }
            }
        };
        return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
    }
    async scheduleOnboardingWelcome(actorId, input) {
        const recipient = await this.resolveRecipient(input.recipientId);
        await this.enforceRateLimit(recipient.id, 'ONBOARDING_WELCOME');
        const data = {
            loginUrl: input.loginUrl,
            supportEmail: input.supportEmail,
            triggeredAt: this.now().toISOString()
        };
        if (actorId) {
            data.triggeredBy = { id: actorId };
        }
        const payload = {
            type: 'ONBOARDING_WELCOME',
            channel: 'email',
            recipient,
            data
        };
        return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
    }
    async scheduleCommunityEvent(actorId, input) {
        const recipient = await this.resolveRecipient(input.recipientId);
        await this.enforceRateLimit(recipient.id, 'COMMUNITY_EVENT');
        const payload = {
            type: 'COMMUNITY_EVENT',
            channel: 'email',
            recipient,
            data: {
                eventId: input.eventId,
                eventName: input.eventName,
                eventStartsAt: input.eventStartsAt,
                ctaUrl: input.ctaUrl,
                triggeredAt: this.now().toISOString(),
                triggeredBy: { id: actorId }
            }
        };
        return this.enqueue(this.prisma, payload, this.toScheduleOptions(input));
    }
}
exports.NotificationService = NotificationService;
exports.notificationService = new NotificationService(prisma_1.default);
