"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.biomarkerLogRouter = exports.biomarkerRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const biomarker_service_1 = require("./biomarker.service");
const isoTimestampSchema = zod_1.z
    .string()
    .min(1, 'timestamp is required')
    .datetime({ offset: true, message: 'timestamp must be an ISO 8601 string with timezone' })
    .transform((value) => new Date(value));
const manualOrWhoopSourceSchema = zod_1.z.union([
    zod_1.z.literal(client_1.BiomarkerSource.MANUAL),
    zod_1.z.literal(client_1.BiomarkerSource.WHOOP)
]);
const finiteNumber = (message) => zod_1.z
    .number({ invalid_type_error: message })
    .refine((value) => Number.isFinite(value), { message: `${message} must be finite` });
const definitionCreateSchema = zod_1.z
    .object({
    slug: zod_1.z
        .string()
        .min(1, 'slug is required')
        .regex(/^[a-z0-9-]+$/, 'slug must use lowercase letters, numbers, or hyphen separators'),
    name: zod_1.z.string().min(1, 'name is required'),
    unit: zod_1.z.string().min(1, 'unit is required'),
    referenceLow: finiteNumber('referenceLow').nullable().optional(),
    referenceHigh: finiteNumber('referenceHigh').nullable().optional(),
    source: manualOrWhoopSourceSchema
})
    .superRefine((data, ctx) => {
    if (data.referenceLow !== null &&
        data.referenceLow !== undefined &&
        data.referenceHigh !== null &&
        data.referenceHigh !== undefined &&
        data.referenceLow > data.referenceHigh) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'referenceLow cannot be greater than referenceHigh',
            path: ['referenceLow']
        });
    }
});
const definitionUpdateSchema = zod_1.z
    .object({
    name: zod_1.z.string().min(1, 'name must be at least 1 character').optional(),
    unit: zod_1.z.string().min(1, 'unit must be at least 1 character').optional(),
    referenceLow: finiteNumber('referenceLow').nullable().optional(),
    referenceHigh: finiteNumber('referenceHigh').nullable().optional(),
    source: manualOrWhoopSourceSchema.optional(),
    expectedUpdatedAt: isoTimestampSchema
})
    .superRefine((data, ctx) => {
    if (data.name === undefined &&
        data.unit === undefined &&
        data.source === undefined &&
        data.referenceLow === undefined &&
        data.referenceHigh === undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Provide at least one field to update',
            path: []
        });
    }
    if (data.referenceLow !== null &&
        data.referenceLow !== undefined &&
        data.referenceHigh !== null &&
        data.referenceHigh !== undefined &&
        data.referenceLow > data.referenceHigh) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'referenceLow cannot be greater than referenceHigh',
            path: ['referenceLow']
        });
    }
});
const manualLogCreateSchema = zod_1.z.object({
    biomarkerId: zod_1.z.string().min(1, 'biomarkerId is required'),
    value: zod_1.z
        .number({ invalid_type_error: 'value must be a number' })
        .positive('value must be greater than zero'),
    unit: zod_1.z.string().min(1, 'unit must be at least 1 character').optional(),
    capturedAt: isoTimestampSchema,
    source: zod_1.z.literal(client_1.BiomarkerSource.MANUAL, {
        errorMap: () => ({ message: 'source must be MANUAL for manual entries' })
    }),
    notes: zod_1.z.string().max(500, 'notes must be 500 characters or fewer').optional()
});
const manualLogUpdateSchema = zod_1.z
    .object({
    value: zod_1.z
        .number({ invalid_type_error: 'value must be a number' })
        .positive('value must be greater than zero')
        .optional(),
    unit: zod_1.z.string().min(1, 'unit must be at least 1 character').optional(),
    capturedAt: isoTimestampSchema.optional(),
    accepted: zod_1.z.boolean().optional(),
    flagged: zod_1.z.boolean().optional(),
    notes: zod_1.z.string().max(500, 'notes must be 500 characters or fewer').optional(),
    expectedUpdatedAt: isoTimestampSchema
})
    .superRefine((data, ctx) => {
    if (data.value === undefined &&
        data.unit === undefined &&
        data.capturedAt === undefined &&
        data.accepted === undefined &&
        data.flagged === undefined &&
        data.notes === undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Provide at least one field to update',
            path: []
        });
    }
});
const listLogsQuerySchema = zod_1.z.object({
    biomarkerId: zod_1.z.string().min(1).optional(),
    cursor: zod_1.z.string().min(1).optional(),
    limit: zod_1.z.preprocess((value) => {
        if (value === undefined || value === null || value === '') {
            return 20;
        }
        const parsed = Number.parseInt(String(value), 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    }, zod_1.z
        .number({ invalid_type_error: 'limit must be a number' })
        .int()
        .min(1, 'limit must be at least 1')
        .max(100, 'limit must not exceed 100'))
});
const deleteQuerySchema = zod_1.z.object({
    expectedUpdatedAt: isoTimestampSchema
});
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const biomarkerRouter = (0, express_1.Router)();
exports.biomarkerRouter = biomarkerRouter;
biomarkerRouter.use(guards_1.requireAuth);
biomarkerRouter.get('/', guards_1.requireActiveUser, async (_req, res, next) => {
    try {
        const definitions = await biomarker_service_1.biomarkerService.listDefinitions();
        res.status(200).json(definitions);
    }
    catch (error) {
        next(error);
    }
});
biomarkerRouter.get('/:biomarkerId', guards_1.requireActiveUser, async (req, res, next) => {
    try {
        const biomarker = await biomarker_service_1.biomarkerService.getDefinition(req.params.biomarkerId);
        res.status(200).json(biomarker);
    }
    catch (error) {
        next(error);
    }
});
biomarkerRouter.post('/', guards_1.requireAdmin, async (req, res, next) => {
    try {
        const payload = validate(definitionCreateSchema, req.body);
        const created = await biomarker_service_1.biomarkerService.createDefinition(req.user.id, payload);
        res.status(201).json(created);
    }
    catch (error) {
        next(error);
    }
});
biomarkerRouter.patch('/:biomarkerId', guards_1.requireAdmin, async (req, res, next) => {
    try {
        const payload = validate(definitionUpdateSchema, req.body);
        const updated = await biomarker_service_1.biomarkerService.updateDefinition(req.user.id, req.params.biomarkerId, payload);
        res.status(200).json(updated);
    }
    catch (error) {
        next(error);
    }
});
biomarkerRouter.delete('/:biomarkerId', guards_1.requireAdmin, async (req, res, next) => {
    try {
        const payload = validate(deleteQuerySchema, req.query);
        await biomarker_service_1.biomarkerService.deleteDefinition(req.user.id, req.params.biomarkerId, payload.expectedUpdatedAt);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
const biomarkerLogRouter = (0, express_1.Router)();
exports.biomarkerLogRouter = biomarkerLogRouter;
biomarkerLogRouter.use(guards_1.requireAuth, guards_1.requireActiveUser);
biomarkerLogRouter.get('/', async (req, res, next) => {
    try {
        const query = validate(listLogsQuerySchema, req.query);
        const { data, nextCursor } = await biomarker_service_1.biomarkerService.listLogs(req.user.id, {
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
    }
    catch (error) {
        next(error);
    }
});
biomarkerLogRouter.post('/', async (req, res, next) => {
    try {
        const payload = validate(manualLogCreateSchema, req.body);
        const created = await biomarker_service_1.biomarkerService.createManualLog(req.user.id, payload);
        res.status(201).json(created);
    }
    catch (error) {
        next(error);
    }
});
biomarkerLogRouter.patch('/:logId', async (req, res, next) => {
    try {
        const payload = validate(manualLogUpdateSchema, req.body);
        const updated = await biomarker_service_1.biomarkerService.updateManualLog(req.user.id, req.params.logId, payload);
        res.status(200).json(updated);
    }
    catch (error) {
        next(error);
    }
});
biomarkerLogRouter.delete('/:logId', async (req, res, next) => {
    try {
        const payload = validate(deleteQuerySchema, req.query);
        await biomarker_service_1.biomarkerService.deleteManualLog(req.user.id, req.params.logId, payload.expectedUpdatedAt);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
