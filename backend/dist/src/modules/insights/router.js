"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insightsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const insight_service_1 = require("./insight.service");
const generationRequestSchema = zod_1.z.object({
    focus: zod_1.z.string().trim().min(1).max(200).optional(),
    biomarkerWindowDays: zod_1.z.number().int().min(1).max(30).optional(),
    includeManualLogs: zod_1.z.boolean().optional(),
    retryOf: zod_1.z.string().trim().min(1).optional()
});
const validate = (schema, value) => {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const router = (0, express_1.Router)();
exports.insightsRouter = router;
router.use(guards_1.requireAuth, guards_1.requireActiveUser);
router.post('/generate', async (req, res, next) => {
    try {
        const payload = validate(generationRequestSchema, req.body);
        const job = await insight_service_1.insightsService.requestGeneration(req.user.id, payload);
        res.status(202).json(job);
    }
    catch (error) {
        next(error);
    }
});
