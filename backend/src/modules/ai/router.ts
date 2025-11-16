import { Router } from 'express';
import { z } from 'zod';
import { PanelUploadSource } from '@prisma/client';

import { requireActiveUser, requireAuth } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { panelIngestionService, type PanelUploadInput } from './panel-ingest.service';
import { labUploadSessionService } from '../lab-upload/upload-session.service';
import env from '../../config/env';
import { longevityPlanService, type LongevityPlanRequest } from './plan.service';

const router = Router();

const validate = <T>(schema: z.ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
};

const panelUploadSchema = z.object({
  sessionId: z.string().trim().min(1),
  storageKey: z.string().trim().min(1),
  source: z.nativeEnum(PanelUploadSource).optional(),
  contentType: z.string().trim().optional(),
  pageCount: z.number().int().min(1).max(200).optional(),
  rawMetadata: z.record(z.string(), z.unknown()).optional(),
  normalizedPayload: z.record(z.string(), z.unknown()).optional(),
  measurements: z
const uploadSessionSchema = z.object({
  fileName: z.string().trim().min(1).max(256),
  contentType: z.string().trim().min(1).max(128),
  byteSize: z.number().int().min(1).max(env.LAB_UPLOAD_MAX_SIZE_MB * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i)
});

    .array(
      z.object({
        biomarkerId: z.string().trim().min(1).optional(),
        markerName: z.string().trim().min(1),
        value: z.number().finite().optional(),
        unit: z.string().trim().max(32).optional(),
        referenceLow: z.number().optional(),
        referenceHigh: z.number().optional(),
        capturedAt: z.string().datetime().optional(),
        confidence: z.number().min(0).max(1).optional(),
        flags: z.record(z.string(), z.unknown()).optional(),
        source: z.nativeEnum(PanelUploadSource).optional()
      })
    )
    .max(200)
    .optional()
});

const planRequestSchema = z.object({
  focusAreas: z.array(z.string().trim().min(1)).max(10).optional(),
  goals: z.array(z.string().trim().min(1)).max(10).optional(),
  riskTolerance: z.enum(['low', 'moderate', 'high']).optional(),
  includeUploads: z.array(z.string().trim().min(1)).max(20).optional(),
  includeWearables: z.boolean().optional(),
  lifestyleNotes: z.string().trim().max(1000).optional(),
  retryOf: z.string().trim().min(1).optional()
});

const listLimitSchema = z
  .preprocess(
    (value) => (value === undefined || value === null || value === '' ? 10 : Number(value)),
    z.number().int().min(1).max(25)
  )
  .optional();

const panelUploadListQuerySchema = z.object({
  limit: listLimitSchema
});

const panelUploadTagSchema = z.object({
  planId: z.union([z.string().trim().min(1), z.null()]).optional(),
  biomarkerIds: z.array(z.string().trim().min(1)).max(25).optional()
});

const planListQuerySchema = z.object({
  limit: z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? 10 : Number(value)),
      z.number().int().min(1).max(25)
    )
    .optional()
});

type PlanListQuery = z.infer<typeof planListQuerySchema>;

router.use(requireAuth, requireActiveUser);

router.post('/uploads/sessions', async (req, res, next) => {
  try {
    const payload = validate(uploadSessionSchema, req.body) as {
      fileName: string;
      contentType: string;
      byteSize: number;
      sha256: string;
    };
    const session = await labUploadSessionService.createSession({
      userId: req.user!.id,
      fileName: payload.fileName,
      contentType: payload.contentType,
      byteSize: payload.byteSize,
      sha256: payload.sha256.toLowerCase()
    });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/uploads', async (req, res, next) => {
  try {
    const payload = validate(panelUploadSchema, req.body) as PanelUploadInput;
    const upload = await panelIngestionService.recordUpload(req.user!.id, payload);
    res.status(201).json(upload);
  } catch (error) {
    next(error);
  }
});

router.get('/uploads', async (req, res, next) => {
  try {
    const query = validate(panelUploadListQuerySchema, req.query) as { limit?: number };
    const uploads = await panelIngestionService.listUploads(req.user!.id, query.limit ?? 10);
    res.status(200).json(uploads);
  } catch (error) {
    next(error);
  }
});

router.get('/uploads/:uploadId', async (req, res, next) => {
  try {
    const upload = await panelIngestionService.getUpload(req.user!.id, req.params.uploadId);
    res.status(200).json(upload);
  } catch (error) {
    next(error);
  }
});

router.patch('/uploads/:uploadId/tags', async (req, res, next) => {
  try {
    const payload = validate(panelUploadTagSchema, req.body) as { planId?: string | null; biomarkerIds?: string[] };
    const upload = await panelIngestionService.updateTags(req.user!.id, req.params.uploadId, payload);
    res.status(200).json(upload);
  } catch (error) {
    next(error);
  }
});

router.get('/uploads/:uploadId/download', async (req, res, next) => {
  try {
    const payload = await panelIngestionService.resolveDownloadUrl(req.user!.id, req.params.uploadId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/plans', async (req, res, next) => {
  try {
    const payload = validate(planRequestSchema, req.body) as LongevityPlanRequest;
    const { plan, job } = await longevityPlanService.requestPlan(req.user!.id, payload);
    res.status(202).json({
      plan,
      job: {
        id: job.id,
        status: job.status,
        queue: job.queue,
        requestedById: job.requestedById,
        planId: job.planId
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/plans', async (req, res, next) => {
  try {
    const query = validate(planListQuerySchema, req.query) as PlanListQuery;
    const plans = await longevityPlanService.listPlans(req.user!.id, query.limit ?? 10);
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
});

router.get('/plans/:planId', async (req, res, next) => {
  try {
    const plan = await longevityPlanService.getPlan(req.user!.id, req.params.planId);
    res.status(200).json(plan);
  } catch (error) {
    next(error);
  }
});

export { router as aiRouter };

