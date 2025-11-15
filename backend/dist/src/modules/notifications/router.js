"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const notification_service_1 = require("./notification.service");
const isoDateSchema = zod_1.z
    .string()
    .datetime({ offset: true, message: 'sendAt must be an ISO 8601 string with timezone' })
    .transform((value) => new Date(value));
const optionalSendAtSchema = isoDateSchema.optional();
const insightNotificationSchema = zod_1.z.object({
    recipientId: zod_1.z.string().min(1, 'recipientId is required'),
    insightId: zod_1.z.string().min(1, 'insightId is required'),
    insightTitle: zod_1.z.string().min(1, 'insightTitle is required'),
    summary: zod_1.z.string().max(500, 'summary must be 500 characters or fewer').optional(),
    sendAt: optionalSendAtSchema
});
const streakNotificationSchema = zod_1.z.object({
    recipientId: zod_1.z.string().min(1, 'recipientId is required'),
    streakType: zod_1.z.enum(['INSIGHTS', 'LOGGING', 'COMMUNITY'], {
        errorMap: () => ({ message: 'streakType must be INSIGHTS, LOGGING, or COMMUNITY' })
    }),
    currentStreak: zod_1.z
        .number({ invalid_type_error: 'currentStreak must be a number' })
        .int('currentStreak must be an integer')
        .positive('currentStreak must be greater than zero'),
    sendAt: optionalSendAtSchema
});
const moderationNotificationSchema = zod_1.z.object({
    recipientId: zod_1.z.string().min(1, 'recipientId is required'),
    flagId: zod_1.z.string().min(1, 'flagId is required'),
    status: zod_1.z.nativeEnum(client_1.FlagStatus),
    reason: zod_1.z.string().max(500, 'reason must be 500 characters or fewer').optional(),
    sendAt: optionalSendAtSchema
});
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const router = (0, express_1.Router)();
exports.notificationsRouter = router;
router.use(guards_1.requireAuth, guards_1.requireActiveUser);
const staffOnly = (0, guards_1.requireRoles)(client_1.Role.COACH, client_1.Role.MODERATOR, client_1.Role.ADMIN);
const moderationOnly = (0, guards_1.requireRoles)(client_1.Role.MODERATOR, client_1.Role.ADMIN);
router.post('/insight', staffOnly, async (req, res, next) => {
    try {
        const payload = validate(insightNotificationSchema, req.body);
        const task = await notification_service_1.notificationService.scheduleInsightAlert(req.user.id, payload);
        res.status(202).json({ taskName: task.taskName });
    }
    catch (error) {
        next(error);
    }
});
router.post('/streak', staffOnly, async (req, res, next) => {
    try {
        const payload = validate(streakNotificationSchema, req.body);
        const task = await notification_service_1.notificationService.scheduleStreakNudge(req.user.id, payload);
        res.status(202).json({ taskName: task.taskName });
    }
    catch (error) {
        next(error);
    }
});
router.post('/moderation', moderationOnly, async (req, res, next) => {
    try {
        const payload = validate(moderationNotificationSchema, req.body);
        const task = await notification_service_1.notificationService.scheduleModerationNotice(req.user.id, payload);
        res.status(202).json({ taskName: task.taskName });
    }
    catch (error) {
        next(error);
    }
});
