import { randomBytes, randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import type { TraceContext } from '../../observability/tracing';

const REQUEST_ID_HEADER = 'x-request-id';
const CLOUD_TRACE_HEADER = 'x-cloud-trace-context';

const randomSpanId = (): string => randomBytes(8).toString('hex');

const parseCloudTraceHeader = (headerValue: string | undefined): TraceContext | undefined => {
  if (!headerValue) {
    return undefined;
  }

  const [traceId, remainder] = headerValue.split('/');
  if (!traceId) {
    return undefined;
  }

  const spanToken = remainder?.split(';')[0];
  const spanId = spanToken && spanToken.length > 0 ? spanToken : randomSpanId();

  return {
    traceId,
    spanId,
    startTime: new Date().toISOString(),
    attributes: {}
  };
};

export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  const headerKey = REQUEST_ID_HEADER as keyof Request['headers'];
  const existingHeader = req.headers[headerKey];

  const requestId = typeof existingHeader === 'string' && existingHeader.length > 0 ? existingHeader : randomUUID();

  res.locals.requestId = requestId;
  req.requestId = requestId;
  if (!existingHeader) {
    req.headers[headerKey] = requestId;
  }

  const cloudTraceValue = req.get(CLOUD_TRACE_HEADER);
  const parentTrace = parseCloudTraceHeader(cloudTraceValue ?? undefined);
  if (parentTrace) {
    req.trace = parentTrace;
    res.locals.trace = parentTrace;
  }

  next();
};
