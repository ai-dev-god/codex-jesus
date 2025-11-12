import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { Role, UserStatus } from '@prisma/client';

import { HttpError } from '../observability-ops/http-error';

const unauthenticated = (): HttpError => new HttpError(401, 'Authentication required', 'UNAUTHENTICATED');
const forbidden = (): HttpError => new HttpError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
const onboardingRequired = (): HttpError => new HttpError(403, 'Complete onboarding to continue', 'ONBOARDING_REQUIRED');

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(unauthenticated());
    return;
  }

  next();
};

export const requireRoles = (...roles: Role[]): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthenticated());
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(forbidden());
      return;
    }

    next();
  };
};

export const requireAdmin = requireRoles(Role.ADMIN);

export const requireActiveUser: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(unauthenticated());
    return;
  }

  if (req.user.status !== UserStatus.ACTIVE) {
    next(onboardingRequired());
    return;
  }

  next();
};
