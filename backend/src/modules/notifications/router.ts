import { Router } from 'express';
import { z } from 'zod';
import { FlagStatus, Role } from '@prisma/client';

import { requireActiveUser, requireAuth, requireRoles } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { notificationService } from './notification.service';

const isoDateSchema = z
  .string()
  .datetime({ offset: true, message: 'sendAt must be an ISO 8601 string with timezone' })
  .transform((value) => new Date(value));

const optionalSendAtSchema = isoDateSchema.optional();

const insightNotificationSchema = z.object({
  recipientId: z.string().min(1, 'recipientId is required'),
  insightId: z.string().min(1, 'insightId is required'),
  insightTitle: z.string().min(1, 'insightTitle is required'),
  summary: z.string().max(500, 'summary must be 500 characters or fewer').optional(),
  sendAt: optionalSendAtSchema
});

const streakNotificationSchema = z.object({
  recipientId: z.string().min(1, 'recipientId is required'),
  streakType: z.enum(['INSIGHTS', 'LOGGING', 'COMMUNITY'], {
    errorMap: () => ({ message: 'streakType must be INSIGHTS, LOGGING, or COMMUNITY' })
  }),
  currentStreak: z
    .number({ invalid_type_error: 'currentStreak must be a number' })
    .int('currentStreak must be an integer')
    .positive('currentStreak must be greater than zero'),
  sendAt: optionalSendAtSchema
});

const moderationNotificationSchema = z.object({
  recipientId: z.string().min(1, 'recipientId is required'),
  flagId: z.string().min(1, 'flagId is required'),
  status: z.nativeEnum(FlagStatus),
  reason: z.string().max(500, 'reason must be 500 characters or fewer').optional(),
  sendAt: optionalSendAtSchema
});

const validate = <S extends z.ZodTypeAny>(schema: S, payload: unknown): z.infer<S> => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
};

const router = Router();
router.use(requireAuth, requireActiveUser);

const staffOnly = requireRoles(Role.COACH, Role.MODERATOR, Role.ADMIN);
const moderationOnly = requireRoles(Role.MODERATOR, Role.ADMIN);

router.post('/insight', staffOnly, async (req, res, next) => {
  try {
    const payload = validate(insightNotificationSchema, req.body);
    const task = await notificationService.scheduleInsightAlert(req.user!.id, payload);
    res.status(202).json({ taskName: task.taskName });
  } catch (error) {
    next(error);
  }
});

router.post('/streak', staffOnly, async (req, res, next) => {
  try {
    const payload = validate(streakNotificationSchema, req.body);
    const task = await notificationService.scheduleStreakNudge(req.user!.id, payload);
    res.status(202).json({ taskName: task.taskName });
  } catch (error) {
    next(error);
  }
});

router.post('/moderation', moderationOnly, async (req, res, next) => {
  try {
    const payload = validate(moderationNotificationSchema, req.body);
    const task = await notificationService.scheduleModerationNotice(req.user!.id, payload);
    res.status(202).json({ taskName: task.taskName });
  } catch (error) {
    next(error);
  }
});

export { router as notificationsRouter };
