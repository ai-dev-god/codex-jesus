import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { onboardingService } from './onboarding.service';

const consentInputSchema = z.object({
  type: z.string().min(1),
  granted: z.boolean(),
  grantedAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  metadata: z.record(z.any()).optional()
});

const profileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    timezone: z
      .string()
      .min(1)
      .refine(
        (value) => {
          try {
            Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        { message: 'Invalid timezone' }
      )
      .optional(),
    baselineSurvey: z
      .record(z.any())
      .refine((value) => Object.keys(value).length > 0, 'Baseline survey cannot be empty')
      .optional(),
    consents: z.array(consentInputSchema).optional()
  })
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided'
  });

const consentUpdateSchema = z.object({
  consents: z.array(consentInputSchema).min(1)
});

const router = Router();

const validate = <T>(schema: z.ZodSchema<T>, payload: unknown): T => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(422, 'Profile validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }

  return result.data;
};

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const profile = await onboardingService.getProfile(req.user!.id);
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const payload = validate(profileUpdateSchema, req.body);
    const profile = await onboardingService.updateProfile(req.user!.id, payload);
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
});

router.post('/consents', requireAuth, async (req, res, next) => {
  try {
    const payload = validate(consentUpdateSchema, req.body);
    const profile = await onboardingService.updateProfile(req.user!.id, {
      consents: payload.consents
    });
    res.status(201).json(profile);
  } catch (error) {
    next(error);
  }
});

router.post('/data-export', requireAuth, async (req, res, next) => {
  try {
    const status = await onboardingService.requestDataExport(req.user!.id);
    res.status(202).json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/data-export', requireAuth, async (req, res, next) => {
  try {
    const status = await onboardingService.getLatestDataExport(req.user!.id);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/data-export/:requestId', requireAuth, async (req, res, next) => {
  try {
    const status = await onboardingService.getDataExportRequest(req.user!.id, req.params.requestId);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.post('/data-delete', requireAuth, async (req, res, next) => {
  try {
    const result = await onboardingService.requestDataDeletion(req.user!.id);
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/data-delete', requireAuth, async (req, res, next) => {
  try {
    const status = await onboardingService.getLatestDataDeletion(req.user!.id);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/data-delete/:requestId', requireAuth, async (req, res, next) => {
  try {
    const status = await onboardingService.getDataDeletionStatus(req.user!.id, req.params.requestId);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

export { router as onboardingRouter };
