import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../identity/guards';
import { whoopService } from './whoop.service';
import { HttpError } from '../observability-ops/http-error';

const linkRequestSchema = z
  .object({
    authorizationCode: z.string().min(1, 'authorizationCode cannot be empty').optional(),
    state: z.string().min(1, 'state cannot be empty').optional()
  })
  .refine(
    (payload) => {
      if (payload.authorizationCode) {
        return Boolean(payload.state);
      }
      return true;
    },
    {
      message: 'state is required when authorizationCode is provided',
      path: ['state']
    }
  );

const router = Router();

const validate = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
};

router.use(requireAuth);

router.get('/status', async (req, res, next) => {
  try {
    const status = await whoopService.getStatus(req.user!.id);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.post('/link', async (req, res, next) => {
  try {
    const payload = validate(linkRequestSchema, req.body);
    const status = await whoopService.handleLinkRequest(req.user!.id, payload);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    await whoopService.unlink(req.user!.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { router as whoopRouter };
