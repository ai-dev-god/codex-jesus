"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const onboarding_service_1 = require("./onboarding.service");
const consentInputSchema = zod_1.z.object({
    type: zod_1.z.string().min(1),
    granted: zod_1.z.boolean(),
    grantedAt: zod_1.z.union([zod_1.z.string().datetime({ offset: true }), zod_1.z.null()]).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional()
});
const profileUpdateSchema = zod_1.z
    .object({
    displayName: zod_1.z.string().min(1).max(120).optional(),
    timezone: zod_1.z
        .string()
        .min(1)
        .refine((value) => {
        try {
            Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
        }
        catch {
            return false;
        }
    }, { message: 'Invalid timezone' })
        .optional(),
    baselineSurvey: zod_1.z
        .record(zod_1.z.any())
        .refine((value) => Object.keys(value).length > 0, 'Baseline survey cannot be empty')
        .optional(),
    consents: zod_1.z.array(consentInputSchema).optional()
})
    .partial()
    .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided'
});
const consentUpdateSchema = zod_1.z.object({
    consents: zod_1.z.array(consentInputSchema).min(1)
});
const router = (0, express_1.Router)();
exports.onboardingRouter = router;
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Profile validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
router.get('/me', guards_1.requireAuth, async (req, res, next) => {
    try {
        const profile = await onboarding_service_1.onboardingService.getProfile(req.user.id);
        res.status(200).json(profile);
    }
    catch (error) {
        next(error);
    }
});
router.put('/me', guards_1.requireAuth, async (req, res, next) => {
    try {
        const payload = validate(profileUpdateSchema, req.body);
        const profile = await onboarding_service_1.onboardingService.updateProfile(req.user.id, payload);
        res.status(200).json(profile);
    }
    catch (error) {
        next(error);
    }
});
router.post('/consents', guards_1.requireAuth, async (req, res, next) => {
    try {
        const payload = validate(consentUpdateSchema, req.body);
        const profile = await onboarding_service_1.onboardingService.updateProfile(req.user.id, {
            consents: payload.consents
        });
        res.status(201).json(profile);
    }
    catch (error) {
        next(error);
    }
});
router.post('/data-export', guards_1.requireAuth, async (req, res, next) => {
    try {
        const status = await onboarding_service_1.onboardingService.requestDataExport(req.user.id);
        res.status(202).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.get('/data-export', guards_1.requireAuth, async (req, res, next) => {
    try {
        const status = await onboarding_service_1.onboardingService.getLatestDataExport(req.user.id);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.get('/data-export/:requestId', guards_1.requireAuth, async (req, res, next) => {
    try {
        const status = await onboarding_service_1.onboardingService.getDataExportRequest(req.user.id, req.params.requestId);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.post('/data-delete', guards_1.requireAuth, async (req, res, next) => {
    try {
        const result = await onboarding_service_1.onboardingService.requestDataDeletion(req.user.id);
        res.status(202).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.get('/data-delete', guards_1.requireAuth, async (req, res, next) => {
    try {
        const status = await onboarding_service_1.onboardingService.getLatestDataDeletion(req.user.id);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.get('/data-delete/:requestId', guards_1.requireAuth, async (req, res, next) => {
    try {
        const status = await onboarding_service_1.onboardingService.getDataDeletionStatus(req.user.id, req.params.requestId);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
