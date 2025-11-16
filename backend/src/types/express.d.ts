import type { Role, UserStatus } from '@prisma/client';

import type { Logger } from '../observability/logger';
import type { TraceContext } from '../observability/tracing';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: Role;
      status: UserStatus;
    }

    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
      log?: Logger;
      trace?: TraceContext;
      rawBody?: Buffer;
    }

    interface Locals {
      requestId?: string;
      logger?: Logger;
      trace?: TraceContext;
    }
  }
}

export {};
