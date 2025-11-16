"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoopRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const guards_1 = require("../identity/guards");
const whoop_service_1 = require("./whoop.service");
const http_error_1 = require("../observability-ops/http-error");
const whoop_webhook_handler_1 = require("./whoop-webhook-handler");
const linkRequestSchema = zod_1.z
    .object({
    authorizationCode: zod_1.z.string().min(1, 'authorizationCode cannot be empty').optional(),
    state: zod_1.z.string().min(1, 'state cannot be empty').optional()
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
const router = (0, express_1.Router)();
exports.whoopRouter = router;
const validate = (schema, data) => {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
router.post('/webhook', whoop_webhook_handler_1.whoopWebhookHandler);
router.use(guards_1.requireAuth);
router.get('/status', async (req, res, next) => {
    try {
        const status = await whoop_service_1.whoopService.getStatus(req.user.id);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.post('/link', async (req, res, next) => {
    try {
        const payload = validate(linkRequestSchema, req.body);
        const status = await whoop_service_1.whoopService.handleLinkRequest(req.user.id, payload);
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.delete('/', async (req, res, next) => {
    try {
        await whoop_service_1.whoopService.unlink(req.user.id);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
