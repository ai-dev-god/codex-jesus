import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import env from '../../config/env';
import { rateLimit } from '../../observability/rate-limit';
import { HttpError } from '../observability-ops/http-error';
import { requireAuth } from './guards';
import { identityService } from './identity.service';
import type { RequestContext } from './types';

const router = Router();
const sensitiveRateLimiter = rateLimit({
  scope: 'auth',
  windowSeconds: 60,
  max: 10,
  key: (req) => {
    const ip = req.ip ?? (req.headers['x-forwarded-for'] as string | undefined) ?? 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'anonymous';
    return `${ip}:${req.path}:${email}`;
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1),
  acceptedTerms: z.boolean(),
  marketingOptIn: z.boolean().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const googleSchema = z.object({
  idToken: z.string().min(10),
  timezone: z.string().optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

const logoutSchema = z
  .object({
    refreshToken: z.string().min(10)
  })
  .partial();

const validate = <T>(schema: z.ZodSchema<T>, payload: unknown): T => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(400, 'Invalid request payload', 'VALIDATION_ERROR', result.error.flatten());
  }

  return result.data;
};

const requestContext = (req: Request): RequestContext => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent') ?? undefined
});

router.post('/register', sensitiveRateLimiter, async (req, res, next) => {
  try {
    const payload = validate(registerSchema, req.body);
    const response = await identityService.registerWithEmail(payload, requestContext(req));
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

router.post('/login', sensitiveRateLimiter, async (req, res, next) => {
  try {
    const payload = validate(loginSchema, req.body);
    const response = await identityService.loginWithEmail(payload, requestContext(req));
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.post('/google', sensitiveRateLimiter, async (req, res, next) => {
  try {
    const payload = validate(googleSchema, req.body);
    const response = await identityService.loginWithGoogle(payload, requestContext(req));
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.get('/google/client', async (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID) {
    res.status(200).json({ enabled: false, clientId: null });
    return;
  }

  res.status(200).json({
    enabled: true,
    clientId: env.GOOGLE_CLIENT_ID
  });
});

router.post('/refresh', async (req, res, next) => {
  try {
    const payload = validate(refreshSchema, req.body);
    const response = await identityService.refreshTokens(payload);
    res.status(200).json(response.tokens);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const payload = validate(logoutSchema, req.body ?? {});
    await identityService.logout(req.user!.id, payload.refreshToken);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await identityService.getCurrentUser(req.user!.id);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
