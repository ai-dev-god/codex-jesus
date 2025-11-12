import type { NextFunction, Request, Response } from 'express';

import { tokenService } from './token-service';

const BEARER_PREFIX = 'bearer ';

export const sessionMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith(BEARER_PREFIX)) {
    const token = authHeader.slice(BEARER_PREFIX.length).trim();
    const decoded = tokenService.decodeAccessToken(token);

    if (decoded) {
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        status: decoded.status
      };
    }
  }

  next();
};
