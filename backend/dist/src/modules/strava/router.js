"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stravaRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const strava_service_1 = require("./strava.service");
const linkRequestSchema = zod_1.z
    .object({
    authorizationCode: zod_1.z.string().min(1, 'authorizationCode cannot be empty').optional(),
    state: zod_1.z.string().min(1, 'state cannot be empty').optional(),
    redirectUri: zod_1.z.string().url('redirectUri must be a valid URL').optional()
})
    .refine((payload) => {
    if (payload.authorizationCode) {
        return Boolean(payload.state);
    }
    return true;
}, {
    message: 'state is required when authorizationCode is provided',
    path: ['state']
});
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const router = (0, express_1.Router)();
exports.stravaRouter = router;
router.use(guards_1.requireAuth);
router.get('/status', async (req, res, next) => {
    try {
        const status = await strava_service_1.stravaService.getStatus(req.user.id);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.post('/link', async (req, res, next) => {
    try {
        const payload = validate(linkRequestSchema, req.body);
        const status = await strava_service_1.stravaService.handleLinkRequest(req.user.id, payload);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.delete('/', async (req, res, next) => {
    try {
        await strava_service_1.stravaService.unlink(req.user.id);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
