"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRouter = void 0;
const express_1 = require("express");
const node_stream_1 = require("node:stream");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const panel_ingest_service_1 = require("./panel-ingest.service");
const plan_service_1 = require("./plan.service");
const router = (0, express_1.Router)();
exports.aiRouter = router;
const validate = (schema, value) => {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const panelUploadSchema = zod_1.z.object({
    storageKey: zod_1.z.string().trim().min(1),
    source: zod_1.z.nativeEnum(client_1.PanelUploadSource).optional(),
    contentType: zod_1.z.string().trim().optional(),
    pageCount: zod_1.z.number().int().min(1).max(200).optional(),
    rawMetadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    normalizedPayload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    measurements: zod_1.z
        .array(zod_1.z.object({
        biomarkerId: zod_1.z.string().trim().min(1).optional(),
        markerName: zod_1.z.string().trim().min(1),
        value: zod_1.z.number().finite().optional(),
        unit: zod_1.z.string().trim().max(32).optional(),
        referenceLow: zod_1.z.number().optional(),
        referenceHigh: zod_1.z.number().optional(),
        capturedAt: zod_1.z.string().datetime().optional(),
        confidence: zod_1.z.number().min(0).max(1).optional(),
        flags: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
        source: zod_1.z.nativeEnum(client_1.PanelUploadSource).optional()
    }))
        .max(200)
        .optional()
});
const planRequestSchema = zod_1.z.object({
    focusAreas: zod_1.z.array(zod_1.z.string().trim().min(1)).max(10).optional(),
    goals: zod_1.z.array(zod_1.z.string().trim().min(1)).max(10).optional(),
    riskTolerance: zod_1.z.enum(['low', 'moderate', 'high']).optional(),
    includeUploads: zod_1.z.array(zod_1.z.string().trim().min(1)).max(20).optional(),
    includeWearables: zod_1.z.boolean().optional(),
    lifestyleNotes: zod_1.z.string().trim().max(1000).optional(),
    retryOf: zod_1.z.string().trim().min(1).optional()
});
const listLimitSchema = zod_1.z
    .preprocess((value) => (value === undefined || value === null || value === '' ? 10 : Number(value)), zod_1.z.number().int().min(1).max(25))
    .optional();
const panelUploadListQuerySchema = zod_1.z.object({
    limit: listLimitSchema
});
const panelUploadTagSchema = zod_1.z.object({
    planId: zod_1.z.union([zod_1.z.string().trim().min(1), zod_1.z.null()]).optional(),
    biomarkerIds: zod_1.z.array(zod_1.z.string().trim().min(1)).max(25).optional()
});
const planListQuerySchema = zod_1.z.object({
    limit: zod_1.z
        .preprocess((value) => (value === undefined || value === null || value === '' ? 10 : Number(value)), zod_1.z.number().int().min(1).max(25))
        .optional()
});
router.use(guards_1.requireAuth, guards_1.requireActiveUser);
router.post('/uploads', async (req, res, next) => {
    try {
        const payload = validate(panelUploadSchema, req.body);
        const upload = await panel_ingest_service_1.panelIngestionService.recordUpload(req.user.id, payload);
        res.status(201).json(upload);
    }
    catch (error) {
        next(error);
    }
});
router.get('/uploads', async (req, res, next) => {
    try {
        const query = validate(panelUploadListQuerySchema, req.query);
        const uploads = await panel_ingest_service_1.panelIngestionService.listUploads(req.user.id, query.limit ?? 10);
        res.status(200).json(uploads);
    }
    catch (error) {
        next(error);
    }
});
router.get('/uploads/:uploadId', async (req, res, next) => {
    try {
        const upload = await panel_ingest_service_1.panelIngestionService.getUpload(req.user.id, req.params.uploadId);
        res.status(200).json(upload);
    }
    catch (error) {
        next(error);
    }
});
router.patch('/uploads/:uploadId/tags', async (req, res, next) => {
    try {
        const payload = validate(panelUploadTagSchema, req.body);
        const upload = await panel_ingest_service_1.panelIngestionService.updateTags(req.user.id, req.params.uploadId, payload);
        res.status(200).json(upload);
    }
    catch (error) {
        next(error);
    }
});
router.get('/uploads/:uploadId/download', async (req, res, next) => {
    try {
        const payload = await panel_ingest_service_1.panelIngestionService.resolveDownloadUrl(req.user.id, req.params.uploadId);
        res.status(200).json(payload);
    }
    catch (error) {
        next(error);
    }
});
router.get('/uploads/downloads/:token', async (req, res, next) => {
    try {
        const { upload, storageUrl } = await panel_ingest_service_1.panelIngestionService.redeemDownloadToken(req.user.id, req.params.token);
        const remote = await fetch(storageUrl);
        if (!remote.ok || !remote.body) {
            throw new http_error_1.HttpError(502, 'Failed to fetch source file from storage.', 'PANEL_DOWNLOAD_UPSTREAM_FAILED');
        }
        const contentType = upload.contentType ?? remote.headers.get('content-type') ?? 'application/octet-stream';
        const contentLength = remote.headers.get('content-length');
        const filename = upload.storageKey.split('/').pop() ?? `${upload.id}.pdf`;
        res.setHeader('Content-Type', contentType);
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const stream = node_stream_1.Readable.fromWeb(remote.body);
        stream.on('error', (error) => {
            remote.body?.cancel().catch(() => { });
            next(error);
        });
        stream.pipe(res);
    }
    catch (error) {
        next(error);
    }
});
router.post('/plans', async (req, res, next) => {
    try {
        const payload = validate(planRequestSchema, req.body);
        const { plan, job } = await plan_service_1.longevityPlanService.requestPlan(req.user.id, payload);
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/plans', async (req, res, next) => {
    try {
        const query = validate(planListQuerySchema, req.query);
        const plans = await plan_service_1.longevityPlanService.listPlans(req.user.id, query.limit ?? 10);
        res.status(200).json(plans);
    }
    catch (error) {
        next(error);
    }
});
router.get('/plans/:planId', async (req, res, next) => {
    try {
        const plan = await plan_service_1.longevityPlanService.getPlan(req.user.id, req.params.planId);
        res.status(200).json(plan);
    }
    catch (error) {
        next(error);
    }
});
