"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoopWebhookHandler = exports.createWhoopWebhookHandler = exports.verifyWhoopWebhookSignature = exports.resolveWhoopTraceId = exports.resolveWhoopUserIdFromPayload = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = __importDefault(require("../../config/env"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const whoop_sync_queue_1 = require("./whoop-sync-queue");
const SIGNATURE_HEADER_CANDIDATES = ['x-whoop-signature', 'whoop-signature', 'x-signature', 'x-hub-signature'];
const respondWithError = (res, status, code, message) => res.status(status).json({
    error: {
        code,
        message
    }
});
const asRecord = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }
    return payload;
};
const toStringValue = (value) => {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `${value}`;
    }
    return null;
};
const resolveWhoopUserIdFromPayload = (payload) => {
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
            const resolved = (0, exports.resolveWhoopUserIdFromPayload)(nested);
            if (resolved) {
                return resolved;
            }
        }
    }
    return null;
};
exports.resolveWhoopUserIdFromPayload = resolveWhoopUserIdFromPayload;
const resolveWhoopTraceId = (payload) => {
    const candidateKeys = ['trace_id', 'traceId', 'id', 'event_id', 'eventId'];
    for (const key of candidateKeys) {
        if (key in payload) {
            const value = toStringValue(payload[key]);
            if (value) {
                return value;
            }
        }
    }
    const nestedTrace = (payload.trace && typeof payload.trace === 'object' && !Array.isArray(payload.trace)
        ? (0, exports.resolveWhoopTraceId)(payload.trace)
        : null) ??
        (payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
            ? (0, exports.resolveWhoopTraceId)(payload.meta)
            : null);
    return nestedTrace;
};
exports.resolveWhoopTraceId = resolveWhoopTraceId;
const normalizeSecret = (secret) => {
    if (!secret) {
        return null;
    }
    const trimmed = secret.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const extractSignatures = (headerValue) => {
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
const verifyWhoopWebhookSignature = (rawBody, headerValue, secret) => {
    if (!rawBody || rawBody.length === 0 || !headerValue) {
        return false;
    }
    const normalizedSecret = normalizeSecret(secret);
    if (!normalizedSecret) {
        return false;
    }
    const hmac = node_crypto_1.default.createHmac('sha256', normalizedSecret);
    hmac.update(rawBody);
    const digestHex = hmac.digest('hex');
    const digestBuffer = Buffer.from(digestHex, 'hex');
    const digestStringBuffer = Buffer.from(digestHex, 'utf8');
    const candidates = extractSignatures(headerValue);
    for (const candidate of candidates) {
        const normalizedCandidate = candidate.trim().toLowerCase();
        if (normalizedCandidate.length === digestHex.length) {
            const candidateStringBuffer = Buffer.from(normalizedCandidate, 'utf8');
            if (node_crypto_1.default.timingSafeEqual(candidateStringBuffer, digestStringBuffer)) {
                return true;
            }
        }
        try {
            const candidateBuffer = Buffer.from(normalizedCandidate, 'hex');
            if (candidateBuffer.length === digestBuffer.length && node_crypto_1.default.timingSafeEqual(candidateBuffer, digestBuffer)) {
                return true;
            }
        }
        catch {
            // Ignore invalid hex candidates.
        }
    }
    return false;
};
exports.verifyWhoopWebhookSignature = verifyWhoopWebhookSignature;
const getSignatureHeader = (req) => {
    for (const header of SIGNATURE_HEADER_CANDIDATES) {
        const value = req.headers[header] ?? req.headers[header.toLowerCase()];
        if (value) {
            return Array.isArray(value) ? value[0] : value;
        }
    }
    return undefined;
};
const enqueueSyncTask = async (deps, integration, traceId) => {
    const payload = {
        userId: integration.userId,
        whoopUserId: integration.whoopUserId,
        reason: 'webhook'
    };
    const options = traceId ? { taskName: `whoop-webhook-${traceId}` } : undefined;
    await deps.enqueue(deps.prisma, payload, options);
};
const createWhoopWebhookHandler = (dependencies) => {
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
            const isValidSignature = (0, exports.verifyWhoopWebhookSignature)(req.rawBody, signatureHeader, deps.secret);
            if (!isValidSignature) {
                req.log?.warn('[whoop-webhook] Invalid signature received');
                return respondWithError(res, 401, 'WHOOP_WEBHOOK_INVALID_SIGNATURE', 'Signature validation failed.');
            }
            const payload = asRecord(req.body);
            if (!payload) {
                req.log?.warn('[whoop-webhook] Payload is not a JSON object');
                return respondWithError(res, 400, 'WHOOP_WEBHOOK_INVALID_PAYLOAD', 'Webhook payload must be a JSON object.');
            }
            const whoopUserId = (0, exports.resolveWhoopUserIdFromPayload)(payload);
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
            const traceId = (0, exports.resolveWhoopTraceId)(payload);
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
        }
        catch (error) {
            next(error);
        }
    };
};
exports.createWhoopWebhookHandler = createWhoopWebhookHandler;
exports.whoopWebhookHandler = (0, exports.createWhoopWebhookHandler)({
    prisma: prisma_1.default,
    secret: env_1.default.WHOOP_WEBHOOK_SECRET ?? null,
    enqueue: whoop_sync_queue_1.enqueueWhoopSyncTask
});
