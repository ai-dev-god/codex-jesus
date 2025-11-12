import type { NextFunction, Request, Response } from 'express';

import { HttpError } from './http-error';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new HttpError(404, `Resource not found for ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
};
