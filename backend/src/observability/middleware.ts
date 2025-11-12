import type { NextFunction, Request, Response } from 'express';

import { baseLogger } from './logger';
import { recordHttpMetric } from './metrics';
import { createTraceContext, finishTraceContext } from './tracing';

const toLatency = (durationMs: number): string => `${(durationMs / 1000).toFixed(6)}s`;

const resolveRoute = (req: Request): string => {
  if (req.route?.path) {
    return Array.isArray(req.route.path) ? req.route.path.join('|') : req.route.path;
  }

  if (typeof req.baseUrl === 'string' && req.baseUrl.length > 0) {
    return `${req.baseUrl}${req.path}`;
  }

  return req.path ?? req.originalUrl ?? 'unknown';
};

export const observabilityMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startHr = process.hrtime.bigint();
  const requestTarget = req.originalUrl ?? req.path ?? 'unknown';

  const parentTrace = req.trace;
  const trace = createTraceContext(`${req.method} ${requestTarget}`, parentTrace);

  res.locals.trace = trace;
  req.trace = trace;

  const requestId = res.locals.requestId ?? req.requestId;
  const logger = baseLogger.with({
    component: 'http',
    traceId: trace.traceId,
    spanId: trace.spanId,
    defaultFields: {
      requestId,
      method: req.method,
      route: requestTarget,
      path: req.originalUrl,
      host: req.get('host') ?? undefined
    }
  });

  res.locals.logger = logger;
  req.log = logger;

  res.on('finish', () => {
    const resolvedRoute = resolveRoute(req);
    const endHr = process.hrtime.bigint();
    const durationMs = Number(endHr - startHr) / 1_000_000;

    const latency = toLatency(durationMs);
    const httpRequest = {
      requestMethod: req.method,
      requestUrl: req.originalUrl ?? resolvedRoute,
      protocol: req.protocol?.toUpperCase(),
      status: res.statusCode,
      latency,
      userAgent: req.get('user-agent') ?? undefined,
      remoteIp: req.ip ?? undefined,
      referer: req.get('referer') ?? undefined
    };

    logger.info('HTTP request completed', {
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(3)),
      httpRequest
    });

    recordHttpMetric({
      method: req.method,
      route: resolvedRoute,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(3))
    });

    finishTraceContext(trace, {
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(3))
    });
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      const durationMs = Number(process.hrtime.bigint() - startHr) / 1_000_000;
      logger.warn('HTTP connection closed before response completed', {
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(3))
      });
      finishTraceContext(trace, {
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        aborted: true
      });
    }
  });

  next();
};
