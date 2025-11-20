import { Router } from 'express';
import { z } from 'zod';
import { MealType } from '@prisma/client';

import { requireActiveUser, requireAuth } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { nutritionService } from './nutrition.service';

const router = Router();

const createLogSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(MealType),
  calories: z.number().int().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fats: z.number().min(0),
  items: z.array(z.string()).optional(),
  eatenAt: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional()
});

const updateLogSchema = createLogSchema.partial();

const macroGoalsSchema = z.object({
  calories: z.number().int().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fats: z.number().min(0)
});

const dateQuerySchema = z.object({
  date: z.string().datetime().optional()
});

const validate = <T>(schema: z.ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
};

router.use(requireAuth, requireActiveUser);

router.post('/logs', async (req, res, next) => {
  try {
    const payload = validate(createLogSchema, req.body);
    const log = await nutritionService.logMeal(req.user!.id, payload);
    res.status(201).json(log);
  } catch (error) {
    next(error);
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const query = validate(dateQuerySchema, req.query);
    const date = query.date ? new Date(query.date) : new Date();
    const logs = await nutritionService.getDailyLogs(req.user!.id, date);
    res.status(200).json(logs);
  } catch (error) {
    next(error);
  }
});

router.patch('/logs/:id', async (req, res, next) => {
  try {
    const payload = validate(updateLogSchema, req.body);
    const log = await nutritionService.updateLog(req.user!.id, req.params.id, payload);
    res.status(200).json(log);
  } catch (error) {
    next(error);
  }
});

router.delete('/logs/:id', async (req, res, next) => {
  try {
    await nutritionService.deleteLog(req.user!.id, req.params.id);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

router.put('/goals', async (req, res, next) => {
  try {
    const payload = validate(macroGoalsSchema, req.body);
    const goals = await nutritionService.setMacroGoals(req.user!.id, payload);
    res.status(200).json(goals);
  } catch (error) {
    next(error);
  }
});

router.get('/goals', async (req, res, next) => {
  try {
    const goals = await nutritionService.getMacroGoals(req.user!.id);
    res.status(200).json(goals);
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const query = validate(dateQuerySchema, req.query);
    const date = query.date ? new Date(query.date) : new Date();
    const summary = await nutritionService.getDailySummary(req.user!.id, date);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

export { router as nutritionRouter };
