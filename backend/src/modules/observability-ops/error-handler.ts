import type { NextFunction, Request, Response } from 'express';

import { baseLogger } from '../../observability/logger';
import { HttpError } from './http-error';

type ExpressError = HttpError | (Error & { status?: number; statusCode?: number; code?: string; details?: unknown });

const DEFAULT_ERROR_MESSAGE = 'Internal server error';
const DEFAULT_ERROR_CODE = 'UNKNOWN_ERROR';

const resolveStatus = (error: ExpressError): number => {
  const status = (error.status ?? (error as { statusCode?: number }).statusCode) ?? 500;
  return status >= 400 && status < 600 ? status : 500;
};

const safeMessage = (error: ExpressError, status: number): string => {
  if (status >= 500) {
    return error instanceof HttpError ? error.message : DEFAULT_ERROR_MESSAGE;
  }

  return error.message;
};

export const errorHandler = (error: ExpressError, req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = resolveStatus(error);
  const traceId = (res.locals.requestId as string | undefined) ?? (req.headers['x-request-id'] as string | undefined);
  const code = error instanceof HttpError ? error.code ?? DEFAULT_ERROR_CODE : error.code ?? DEFAULT_ERROR_CODE;

  const logger = req.log ?? res.locals.logger ?? baseLogger.with({ component: 'error-handler', traceId });

  const logContext = {
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    message: error.message,
    traceId,
    details: (error as { details?: unknown }).details
  };

  if (status >= 500) {
    logger.error('Internal server error', {
      ...logContext,
      stack: error.stack
    });
  } else {
    logger.warn('Client error', logContext);
  }

  res.status(status).json({
    error: {
      message: safeMessage(error, status),
      status,
      code,
      traceId
    }
  });
};
