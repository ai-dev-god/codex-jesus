import { Router } from 'express';
import { z } from 'zod';
import { BiomarkerSource } from '@prisma/client';

import { requireActiveUser, requireAdmin, requireAuth } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { biomarkerService } from './biomarker.service';

const isoTimestampSchema = z
  .string()
  .min(1, 'timestamp is required')
  .datetime({ offset: true, message: 'timestamp must be an ISO 8601 string with timezone' })
  .transform((value) => new Date(value));

const manualOrWhoopSourceSchema = z.union([
  z.literal(BiomarkerSource.MANUAL),
  z.literal(BiomarkerSource.WHOOP)
]);

const finiteNumber = (message: string) =>
  z
    .number({ invalid_type_error: message })
    .refine((value) => Number.isFinite(value), { message: `${message} must be finite` });

const definitionCreateSchema = z
  .object({
    slug: z
      .string()
      .min(1, 'slug is required')
      .regex(/^[a-z0-9-]+$/, 'slug must use lowercase letters, numbers, or hyphen separators'),
    name: z.string().min(1, 'name is required'),
    unit: z.string().min(1, 'unit is required'),
    referenceLow: finiteNumber('referenceLow').nullable().optional(),
    referenceHigh: finiteNumber('referenceHigh').nullable().optional(),
    source: manualOrWhoopSourceSchema
  })
  .superRefine((data, ctx) => {
    if (
      data.referenceLow !== null &&
      data.referenceLow !== undefined &&
      data.referenceHigh !== null &&
      data.referenceHigh !== undefined &&
      data.referenceLow > data.referenceHigh
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'referenceLow cannot be greater than referenceHigh',
        path: ['referenceLow']
      });
    }
  });

const definitionUpdateSchema = z
  .object({
    name: z.string().min(1, 'name must be at least 1 character').optional(),
    unit: z.string().min(1, 'unit must be at least 1 character').optional(),
    referenceLow: finiteNumber('referenceLow').nullable().optional(),
    referenceHigh: finiteNumber('referenceHigh').nullable().optional(),
    source: manualOrWhoopSourceSchema.optional(),
    expectedUpdatedAt: isoTimestampSchema
  })
  .superRefine((data, ctx) => {
    if (
      data.name === undefined &&
      data.unit === undefined &&
      data.source === undefined &&
      data.referenceLow === undefined &&
      data.referenceHigh === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one field to update',
        path: []
      });
    }

    if (
      data.referenceLow !== null &&
      data.referenceLow !== undefined &&
      data.referenceHigh !== null &&
      data.referenceHigh !== undefined &&
      data.referenceLow > data.referenceHigh
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'referenceLow cannot be greater than referenceHigh',
        path: ['referenceLow']
      });
    }
  });

const manualLogCreateSchema = z.object({
  biomarkerId: z.string().min(1, 'biomarkerId is required'),
  value: z
    .number({ invalid_type_error: 'value must be a number' })
    .positive('value must be greater than zero'),
  unit: z.string().min(1, 'unit must be at least 1 character').optional(),
  capturedAt: isoTimestampSchema,
  source: z.literal(BiomarkerSource.MANUAL, {
    errorMap: () => ({ message: 'source must be MANUAL for manual entries' })
  }),
  notes: z.string().max(500, 'notes must be 500 characters or fewer').optional()
});

const manualLogUpdateSchema = z
  .object({
    value: z
      .number({ invalid_type_error: 'value must be a number' })
      .positive('value must be greater than zero')
      .optional(),
    unit: z.string().min(1, 'unit must be at least 1 character').optional(),
    capturedAt: isoTimestampSchema.optional(),
    accepted: z.boolean().optional(),
    flagged: z.boolean().optional(),
    notes: z.string().max(500, 'notes must be 500 characters or fewer').optional(),
    expectedUpdatedAt: isoTimestampSchema
  })
  .superRefine((data, ctx) => {
    if (
      data.value === undefined &&
      data.unit === undefined &&
      data.capturedAt === undefined &&
      data.accepted === undefined &&
      data.flagged === undefined &&
      data.notes === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one field to update',
        path: []
      });
    }
  });

const listLogsQuerySchema = z.object({
  biomarkerId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') {
        return 20;
      }

      const parsed = Number.parseInt(String(value), 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    },
    z
      .number({ invalid_type_error: 'limit must be a number' })
      .int()
      .min(1, 'limit must be at least 1')
      .max(100, 'limit must not exceed 100')
  )
});

const deleteQuerySchema = z.object({
  expectedUpdatedAt: isoTimestampSchema
});

const validate = <S extends z.ZodTypeAny>(schema: S, payload: unknown): z.infer<S> => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }

  return result.data;
};

const biomarkerRouter = Router();
biomarkerRouter.use(requireAuth);

biomarkerRouter.get('/', requireActiveUser, async (_req, res, next) => {
  try {
    const definitions = await biomarkerService.listDefinitions();
    res.status(200).json(definitions);
  } catch (error) {
    next(error);
  }
});

biomarkerRouter.get('/:biomarkerId', requireActiveUser, async (req, res, next) => {
  try {
    const biomarker = await biomarkerService.getDefinition(req.params.biomarkerId);
    res.status(200).json(biomarker);
  } catch (error) {
    next(error);
  }
});

biomarkerRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const payload = validate(definitionCreateSchema, req.body);
    const created = await biomarkerService.createDefinition(req.user!.id, payload);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

biomarkerRouter.patch('/:biomarkerId', requireAdmin, async (req, res, next) => {
  try {
    const payload = validate(definitionUpdateSchema, req.body);
    const updated = await biomarkerService.updateDefinition(
      req.user!.id,
      req.params.biomarkerId,
      payload
    );
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

biomarkerRouter.delete('/:biomarkerId', requireAdmin, async (req, res, next) => {
  try {
    const payload = validate(deleteQuerySchema, req.query);
    await biomarkerService.deleteDefinition(req.user!.id, req.params.biomarkerId, payload.expectedUpdatedAt);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

const biomarkerLogRouter = Router();
biomarkerLogRouter.use(requireAuth, requireActiveUser);

biomarkerLogRouter.get('/', async (req, res, next) => {
  try {
    const query = validate(listLogsQuerySchema, req.query);
    const { data, nextCursor } = await biomarkerService.listLogs(req.user!.id, {
      biomarkerId: query.biomarkerId,
      cursor: query.cursor,
      limit: query.limit
    });

    res.status(200).json({
      data,
      meta: {
        nextCursor,
        hasMore: Boolean(nextCursor)
      }
    });
  } catch (error) {
    next(error);
  }
});

biomarkerLogRouter.post('/', async (req, res, next) => {
  try {
    const payload = validate(manualLogCreateSchema, req.body);
    const created = await biomarkerService.createManualLog(req.user!.id, payload);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

biomarkerLogRouter.patch('/:logId', async (req, res, next) => {
  try {
    const payload = validate(manualLogUpdateSchema, req.body);
    const updated = await biomarkerService.updateManualLog(req.user!.id, req.params.logId, payload);
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

biomarkerLogRouter.delete('/:logId', async (req, res, next) => {
  try {
    const payload = validate(deleteQuerySchema, req.query);
    await biomarkerService.deleteManualLog(
      req.user!.id,
      req.params.logId,
      payload.expectedUpdatedAt
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { biomarkerRouter, biomarkerLogRouter };
