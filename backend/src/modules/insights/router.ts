import { Router } from 'express';
import { z } from 'zod';

import { requireActiveUser, requireAuth } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { insightsService } from './insight.service';

const generationRequestSchema = z.object({
  focus: z.string().trim().min(1).max(200).optional(),
  biomarkerWindowDays: z.number().int().min(1).max(30).optional(),
  includeManualLogs: z.boolean().optional(),
  retryOf: z.string().trim().min(1).optional()
});

const validate = <T>(schema: z.ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
};

const router = Router();

router.use(requireAuth, requireActiveUser);

router.post('/generate', async (req, res, next) => {
  try {
    const payload = validate(generationRequestSchema, req.body);
    const job = await insightsService.requestGeneration(req.user!.id, payload);
    res.status(202).json(job);
  } catch (error) {
    next(error);
  }
});

export { router as insightsRouter };
