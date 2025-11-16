import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';

import prisma from '../../lib/prisma';
import { requireAuth, requireRoles } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';

const router = Router();

const approveSchema = z.object({
  email: z.string().email()
});

const validate = <T>(schema: z.ZodSchema<T>, payload: unknown): T => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
};

router.use(requireAuth, requireRoles(Role.PRACTITIONER, Role.ADMIN));

router.post('/ai-approvals', async (req, res, next) => {
  try {
    const payload = validate(approveSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { email: payload.email },
      include: { profile: true }
    });

    if (!user?.profile) {
      throw new HttpError(404, 'User profile not found.', 'PROFILE_NOT_FOUND');
    }

    const updated = await prisma.profile.update({
      where: { userId: user.id },
      data: {
        aiInterpretationApprovedAt: new Date(),
        aiInterpretationApprovedBy: req.user!.id
      }
    });

    res.status(200).json({
      userId: user.id,
      approvedAt: updated.aiInterpretationApprovedAt?.toISOString() ?? null,
      approvedBy: updated.aiInterpretationApprovedBy
    });
  } catch (error) {
    next(error);
  }
});

export { router as practitionerRouter };

