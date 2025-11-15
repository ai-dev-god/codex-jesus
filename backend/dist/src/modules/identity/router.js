"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const rate_limit_1 = require("../../observability/rate-limit");
const http_error_1 = require("../observability-ops/http-error");
const guards_1 = require("./guards");
const identity_service_1 = require("./identity.service");
const router = (0, express_1.Router)();
exports.authRouter = router;
const sensitiveRateLimiter = (0, rate_limit_1.rateLimit)({
    scope: 'auth',
    windowSeconds: 60,
    max: 10,
    key: (req) => {
        const ip = req.ip ?? req.headers['x-forwarded-for'] ?? 'unknown';
        const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'anonymous';
        return `${ip}:${req.path}:${email}`;
    }
});
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(12),
    displayName: zod_1.z.string().min(1).max(120),
    timezone: zod_1.z.string().min(1),
    acceptedTerms: zod_1.z.boolean(),
    marketingOptIn: zod_1.z.boolean().optional()
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1)
});
const googleSchema = zod_1.z.object({
    idToken: zod_1.z.string().min(10),
    timezone: zod_1.z.string().optional()
});
const refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10)
});
const logoutSchema = zod_1.z
    .object({
    refreshToken: zod_1.z.string().min(10)
})
    .partial();
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(400, 'Invalid request payload', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const requestContext = (req) => ({
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined
});
router.post('/register', sensitiveRateLimiter, async (req, res, next) => {
    try {
        const payload = validate(registerSchema, req.body);
        const response = await identity_service_1.identityService.registerWithEmail(payload, requestContext(req));
        res.status(201).json(response);
    }
    catch (error) {
        next(error);
    }
});
router.post('/login', sensitiveRateLimiter, async (req, res, next) => {
    try {
        const payload = validate(loginSchema, req.body);
        const response = await identity_service_1.identityService.loginWithEmail(payload, requestContext(req));
        res.status(200).json(response);
    }
    catch (error) {
        next(error);
    }
});
router.post('/google', sensitiveRateLimiter, async (req, res, next) => {
    try {
        const payload = validate(googleSchema, req.body);
        const response = await identity_service_1.identityService.loginWithGoogle(payload, requestContext(req));
        res.status(200).json(response);
    }
    catch (error) {
        next(error);
    }
});
router.post('/refresh', async (req, res, next) => {
    try {
        const payload = validate(refreshSchema, req.body);
        const response = await identity_service_1.identityService.refreshTokens(payload);
        res.status(200).json(response.tokens);
    }
    catch (error) {
        next(error);
    }
});
router.post('/logout', guards_1.requireAuth, async (req, res, next) => {
    try {
        const payload = validate(logoutSchema, req.body ?? {});
        await identity_service_1.identityService.logout(req.user.id, payload.refreshToken);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
router.get('/me', guards_1.requireAuth, async (req, res, next) => {
    try {
        const user = await identity_service_1.identityService.getCurrentUser(req.user.id);
        res.status(200).json(user);
    }
    catch (error) {
        next(error);
    }
});
