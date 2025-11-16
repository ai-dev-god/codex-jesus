import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

import {
  createWhoopWebhookHandler,
  resolveWhoopUserIdFromPayload,
  verifyWhoopWebhookSignature
} from '../modules/wearable/whoop-webhook-handler';

describe('whoop webhook helpers', () => {
  it('validates webhook signatures with shared secret', () => {
    const secret = 'test-secret-1234567890';
    const payload = { member_id: '1234', event: 'recovery.updated' };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    expect(verifyWhoopWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(verifyWhoopWebhookSignature(rawBody, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyWhoopWebhookSignature(rawBody, 'invalid-signature', secret)).toBe(false);
  });

  it('resolves member ids from nested payloads', () => {
    const payload = {
      event: 'sleep.updated',
      data: {
        user: {
          user_id: 'nested-123'
        }
      }
    };

    expect(resolveWhoopUserIdFromPayload(payload)).toBe('nested-123');
  });
});

describe('whoop webhook handler', () => {
  const secret = 'webhook-secret-1234567890';
  const buildRequest = (payload: Record<string, unknown>, signature: string): Request =>
    ({
      headers: {
        'x-whoop-signature': signature
      },
      body: payload,
      rawBody: Buffer.from(JSON.stringify(payload)),
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    }) as unknown as Request;

  const buildResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    return res as unknown as Response & {
      status: jest.Mock;
      json: jest.Mock;
    };
  };

  const next: NextFunction = jest.fn();

  const buildHandlerDeps = () => {
    const prisma = {
      whoopIntegration: {
        findUnique: jest.fn()
      }
    };
    const enqueue = jest.fn();

    return {
      prisma: prisma as unknown as PrismaClient,
      rawPrisma: prisma,
      enqueue
    };
  };

  it('rejects requests with invalid signatures', async () => {
    const deps = buildHandlerDeps();
    const handler = createWhoopWebhookHandler({
      prisma: deps.prisma,
      secret,
      enqueue: deps.enqueue
    });

    const payload = { member_id: 'member-123', event: 'recovery.updated' };
    const req = buildRequest(payload, 'invalid');
    const res = buildResponse();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'WHOOP_WEBHOOK_INVALID_SIGNATURE' })
      })
    );
    expect(deps.rawPrisma.whoopIntegration.findUnique).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('acknowledges events when no integration exists', async () => {
    const deps = buildHandlerDeps();
    deps.rawPrisma.whoopIntegration.findUnique.mockResolvedValue(null);

    const handler = createWhoopWebhookHandler({
      prisma: deps.prisma,
      secret,
      enqueue: deps.enqueue
    });

    const payload = { member_id: 'member-123', event: 'sleep.updated' };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const req = buildRequest(payload, signature);
    req.rawBody = rawBody;
    const res = buildResponse();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accepted: true, ignored: 'UNLINKED_MEMBER' }));
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues a sync task when integration is active', async () => {
    const deps = buildHandlerDeps();
    deps.rawPrisma.whoopIntegration.findUnique.mockResolvedValue({
      userId: 'user-123',
      whoopUserId: 'member-123'
    });

    const handler = createWhoopWebhookHandler({
      prisma: deps.prisma,
      secret,
      enqueue: deps.enqueue
    });

    const payload = { member_id: 'member-123', event: 'recovery.updated', trace_id: 'trace-abc' };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const req = buildRequest(payload, `sha256=${signature}`);
    req.rawBody = rawBody;
    const res = buildResponse();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ accepted: true, enqueued: true, traceId: 'trace-abc' })
    );

    expect(deps.enqueue).toHaveBeenCalledWith(
      deps.prisma,
      {
        userId: 'user-123',
        whoopUserId: 'member-123',
        reason: 'webhook'
      },
      { taskName: 'whoop-webhook-trace-abc' }
    );
  });
});

