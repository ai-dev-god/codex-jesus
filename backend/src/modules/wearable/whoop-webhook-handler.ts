import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import crypto from 'node:crypto';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { enqueueAndMaybeRunWhoopSync } from './whoop-sync-dispatcher';
import type { WhoopSyncTaskPayload } from './whoop-sync-queue';

type Dependencies = {
  prisma: PrismaClient;
  secret: string | null;
  dispatch: typeof enqueueAndMaybeRunWhoopSync;
};

type JsonRecord = Record<string, unknown>;

const SIGNATURE_HEADER_CANDIDATES = ['x-whoop-signature', 'whoop-signature', 'x-signature', 'x-hub-signature'];

const respondWithError = (res: Parameters<RequestHandler>[1], status: number, code: string, message: string) =>
  res.status(status).json({
    error: {
      code,
      message
    }
  });

const asRecord = (payload: unknown): JsonRecord | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return payload as JsonRecord;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }
  return null;
};

export const resolveWhoopUserIdFromPayload = (payload: JsonRecord): string | null => {
  const candidateKeys = [
    'member_id',
    'memberId',
    'memberID',
    'user_id',
    'userId',
    'userID',
    'whoop_user_id',
    'whoopUserId',
    'athlete_id',
    'athleteId'
  ];

  for (const key of candidateKeys) {
    if (key in payload) {
      const value = toStringValue(payload[key]);
      if (value) {
        return value;
      }
    }
  }

  const nestedSources = ['user', 'member', 'data', 'payload', 'resource'];
  for (const sourceKey of nestedSources) {
    const nested = payload[sourceKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const resolved = resolveWhoopUserIdFromPayload(nested as JsonRecord);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
};

export const resolveWhoopTraceId = (payload: JsonRecord): string | null => {
  const candidateKeys = ['trace_id', 'traceId', 'id', 'event_id', 'eventId'];
  for (const key of candidateKeys) {
    if (key in payload) {
      const value = toStringValue(payload[key]);
      if (value) {
        return value;
      }
    }
  }

  const nestedTrace =
    (payload.trace && typeof payload.trace === 'object' && !Array.isArray(payload.trace)
      ? resolveWhoopTraceId(payload.trace as JsonRecord)
      : null) ??
    (payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
      ? resolveWhoopTraceId(payload.meta as JsonRecord)
      : null);

  return nestedTrace;
};

const normalizeSecret = (secret: string | null | undefined): string | null => {
  if (!secret) {
    return null;
  }
  const trimmed = secret.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractSignatures = (headerValue: string): string[] => {
  return headerValue
    .split(',')
    .map((segment) => segment.trim())
    .flatMap((segment) => {
      if (!segment) {
        return [];
      }
      const [rawKey, rawValue] = segment.split('=');
      if (rawValue === undefined) {
        return [segment.replace(/^sha256=/i, '').trim()];
      }

      const normalizedKey = rawKey.trim().toLowerCase();
      if (normalizedKey.includes('sig') || normalizedKey.includes('sha') || normalizedKey.startsWith('v')) {
        return [rawValue.trim()];
      }

      return [rawValue.trim()];
    })
    .map((candidate) => candidate.replace(/^sha256=/i, '').trim())
    .filter(Boolean);
};

export const verifyWhoopWebhookSignature = (
  rawBody: Buffer | undefined,
  headerValue: string | undefined,
  secret: string | null
): boolean => {
  if (!rawBody || rawBody.length === 0 || !headerValue) {
    return false;
  }

  const normalizedSecret = normalizeSecret(secret);
  if (!normalizedSecret) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', normalizedSecret);
  hmac.update(rawBody);
  const digestHex = hmac.digest('hex');
  const digestBuffer = Buffer.from(digestHex, 'hex');
  const digestStringBuffer = Buffer.from(digestHex, 'utf8');

  const candidates = extractSignatures(headerValue);
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.trim().toLowerCase();

    if (normalizedCandidate.length === digestHex.length) {
      const candidateStringBuffer = Buffer.from(normalizedCandidate, 'utf8');
      if (crypto.timingSafeEqual(candidateStringBuffer, digestStringBuffer)) {
        return true;
      }
    }

    try {
      const candidateBuffer = Buffer.from(normalizedCandidate, 'hex');
      if (candidateBuffer.length === digestBuffer.length && crypto.timingSafeEqual(candidateBuffer, digestBuffer)) {
        return true;
      }
    } catch {
      // Ignore invalid hex candidates.
    }
  }

  return false;
};

const getSignatureHeader = (req: Parameters<RequestHandler>[0]): string | undefined => {
  for (const header of SIGNATURE_HEADER_CANDIDATES) {
    const value = req.headers[header] ?? req.headers[header.toLowerCase()];
    if (value) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
};

const enqueueSyncTask = async (
  deps: Dependencies,
  integration: { userId: string; whoopUserId: string },
  traceId: string | null
): Promise<void> => {
  const payload: WhoopSyncTaskPayload = {
    userId: integration.userId,
    whoopUserId: integration.whoopUserId,
    reason: 'webhook'
  };

  const options = traceId ? { taskName: `whoop-webhook-${traceId}` } : undefined;
  await deps.dispatch(deps.prisma, payload, { ...options, swallowErrors: true });
};

export const createWhoopWebhookHandler = (dependencies: Dependencies): RequestHandler => {
  const deps = {
    ...dependencies,
    secret: normalizeSecret(dependencies.secret)
  };

  return async (req, res, next) => {
    try {
      if (!deps.secret) {
        return respondWithError(res, 503, 'WHOOP_WEBHOOK_NOT_CONFIGURED', 'Whoop webhook secret is not configured.');
      }

      const signatureHeader = getSignatureHeader(req);
      const isValidSignature = verifyWhoopWebhookSignature(req.rawBody, signatureHeader, deps.secret);
      if (!isValidSignature) {
        req.log?.warn('[whoop-webhook] Invalid signature received');
        return respondWithError(res, 401, 'WHOOP_WEBHOOK_INVALID_SIGNATURE', 'Signature validation failed.');
      }

      const payload = asRecord(req.body);
      if (!payload) {
        req.log?.warn('[whoop-webhook] Payload is not a JSON object');
        return respondWithError(res, 400, 'WHOOP_WEBHOOK_INVALID_PAYLOAD', 'Webhook payload must be a JSON object.');
      }

      const whoopUserId = resolveWhoopUserIdFromPayload(payload);
      if (!whoopUserId) {
        req.log?.warn('[whoop-webhook] Unable to resolve whoopUserId from payload', {
          event: payload.event ?? payload.type ?? payload.event_type
        });
        return res.status(202).json({ accepted: true, ignored: 'UNKNOWN_MEMBER' });
      }

      const integration = await deps.prisma.whoopIntegration.findUnique({ where: { whoopUserId } });
      if (!integration || !integration.whoopUserId) {
        req.log?.info('[whoop-webhook] No integration found for member', { whoopUserId });
        return res.status(202).json({ accepted: true, ignored: 'UNLINKED_MEMBER' });
      }

      const traceId = resolveWhoopTraceId(payload);
      await enqueueSyncTask(deps, { userId: integration.userId, whoopUserId: integration.whoopUserId }, traceId);

      req.log?.info('[whoop-webhook] Enqueued wearable sync', {
        userId: integration.userId,
        whoopUserId: integration.whoopUserId,
        traceId,
        event: payload.event ?? payload.type ?? payload.event_type ?? payload.resource_type ?? 'unknown'
      });

      return res.status(202).json({
        accepted: true,
        enqueued: true,
        traceId: traceId ?? null
      });
    } catch (error) {
      next(error);
    }
  };
};

export const whoopWebhookHandler = createWhoopWebhookHandler({
  prisma: prismaClient,
  secret: env.WHOOP_WEBHOOK_SECRET ?? null,
  dispatch: enqueueAndMaybeRunWhoopSync
});

