"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const panel_ingest_service_1 = require("./panel-ingest.service");
const upload_session_service_1 = require("../lab-upload/upload-session.service");
const env_1 = __importDefault(require("../../config/env"));
const longevity_stack_service_1 = require("./longevity-stack.service");
const interpretation_service_1 = require("./interpretation.service");
const cohort_benchmark_service_1 = require("./cohort-benchmark.service");
const early_warning_service_1 = require("./early-warning.service");
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
const measurementsSchema = zod_1.z
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
    .optional();
const panelUploadSchema = zod_1.z.object({
    sessionId: zod_1.z.string().trim().min(1),
    storageKey: zod_1.z.string().trim().min(1),
    source: zod_1.z.nativeEnum(client_1.PanelUploadSource).optional(),
    contentType: zod_1.z.string().trim().optional(),
    pageCount: zod_1.z.number().int().min(1).max(200).optional(),
    rawMetadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    normalizedPayload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    measurements: measurementsSchema
});
const uploadSessionSchema = zod_1.z.object({
    fileName: zod_1.z.string().trim().min(1).max(256),
    contentType: zod_1.z.string().trim().min(1).max(128),
    byteSize: zod_1.z.number().int().min(1).max(env_1.default.LAB_UPLOAD_MAX_SIZE_MB * 1024 * 1024),
    sha256: zod_1.z.string().regex(/^[a-f0-9]{64}$/i)
});
const interpretationRequestSchema = zod_1.z.object({
    uploadId: zod_1.z.string().trim().min(1)
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
router.post('/uploads/sessions', async (req, res, next) => {
    try {
        const payload = validate(uploadSessionSchema, req.body);
        const session = await upload_session_service_1.labUploadSessionService.createSession({
            userId: req.user.id,
            fileName: payload.fileName,
            contentType: payload.contentType,
            byteSize: payload.byteSize,
            sha256: payload.sha256.toLowerCase()
        });
        res.status(201).json(session);
    }
    catch (error) {
        next(error);
    }
});
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
router.get('/stacks', async (req, res, next) => {
    try {
        const stacks = await longevity_stack_service_1.longevityStackService.computeStacks(req.user.id);
        res.status(200).json(stacks);
    }
    catch (error) {
        next(error);
    }
});
router.post('/interpretations', async (req, res, next) => {
    try {
        const payload = validate(interpretationRequestSchema, req.body);
        const interpretation = await interpretation_service_1.aiInterpretationService.generate(req.user.id, payload.uploadId);
        res.status(200).json(interpretation);
    }
    catch (error) {
        next(error);
    }
});
router.get('/cohort-benchmarks', async (req, res, next) => {
    try {
        const benchmarks = await cohort_benchmark_service_1.cohortBenchmarkService.compute(req.user.id);
        res.status(200).json(benchmarks);
    }
    catch (error) {
        next(error);
    }
});
router.get('/early-warnings', async (req, res, next) => {
    try {
        const warnings = await early_warning_service_1.earlyWarningService.detect(req.user.id);
        res.status(200).json(warnings);
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
