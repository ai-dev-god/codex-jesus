import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../identity/guards';
import { gymService } from './gym.service';
import { HttpError } from '../observability-ops/http-error';

const router = Router();
router.use(requireAuth);

const listQuerySchema = z.object({
  cursor: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length === 0 ? undefined : value)),
  take: z
    .preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().int().min(1).max(100).optional())
});

const workoutIdParamSchema = z.object({
  id: z.string().min(1, 'Workout id is required')
});

router.get('/overview', async (req, res, next) => {
  try {
    const overview = await gymService.getOverview(req.user!.id);
    res.status(200).json(overview);
  } catch (error) {
    next(error);
  }
});

router.get('/workouts', async (req, res, next) => {
  try {
    const params = listQuerySchema.safeParse(req.query);
    if (!params.success) {
      throw new HttpError(422, 'Invalid query parameters', 'VALIDATION_ERROR', params.error.flatten());
    }

    const result = await gymService.listWorkouts(req.user!.id, params.data);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/workouts/:id', async (req, res, next) => {
  try {
    const parsed = workoutIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(422, 'Invalid workout id', 'VALIDATION_ERROR', parsed.error.flatten());
    }

    const workout = await gymService.getWorkout(req.user!.id, parsed.data.id);
    res.status(200).json(workout);
  } catch (error) {
    next(error);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    await gymService.triggerSync(req.user!.id);
    res.status(202).json({ enqueued: true });
  } catch (error) {
    next(error);
  }
});

export { router as gymRouter };

