import { Router } from 'express';
import { z } from 'zod';

import { requireActiveUser, requireAuth } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { roomsService } from './rooms.service';

const trimString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const createRoomSchema = z.object({
  name: z
    .string()
    .min(1, 'name must be at least 1 character')
    .max(64, 'name must be 64 characters or fewer')
    .optional()
    .transform((value) => (typeof value === 'string' ? value.trim() : value))
    .refine((value) => value === undefined || value.length > 0, 'name must be at least 1 character')
});

const joinRoomSchema = z.object({
  inviteCode: z
    .string({ required_error: 'inviteCode is required' })
    .refine((value) => trimString(value) !== undefined, 'inviteCode must be provided')
    .transform((value) => trimString(value)!)
    .refine((value) => value.length >= 4, 'inviteCode must be at least 4 characters')
    .refine((value) => value.length <= 12, 'inviteCode must be 12 characters or fewer')
});

const parse = <Schema extends z.ZodTypeAny>(schema: Schema, payload: unknown): z.infer<Schema> => {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }

  return result.data;
};

const router = Router();

router.use(requireAuth, requireActiveUser);

router.post('/', async (req, res, next) => {
  try {
    const payload = parse(createRoomSchema, req.body);
    const room = await roomsService.createRoom(req.user!, {
      name: payload.name
    });

    res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});

router.post('/join', async (req, res, next) => {
  try {
    const payload = parse(joinRoomSchema, req.body);
    const room = await roomsService.joinRoomByCode(req.user!, payload.inviteCode);

    res.status(200).json(room);
  } catch (error) {
    next(error);
  }
});

router.get('/:roomId', async (req, res, next) => {
  try {
    const room = await roomsService.getRoom(req.user!, req.params.roomId);
    res.status(200).json(room);
  } catch (error) {
    next(error);
  }
});

export { router as roomsRouter };
