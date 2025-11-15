import { Router } from 'express';
import { FlagStatus, Role } from '@prisma/client';
import { z } from 'zod';

import { requireAuth, requireRoles } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import {
  adminService,
  type AuditLogFilters,
  type ListFlagsOptions,
  type ResolveFlagInput,
  type RoleHistoryOptions,
  type RoleUpdateInput
} from './admin.service';

const limitSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') {
      return 20;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  },
  z
    .number({ invalid_type_error: 'limit must be a number' })
    .int()
    .min(1, 'limit must be at least 1')
    .max(50, 'limit must not exceed 50')
);

const cursorSchema = z.string().trim().min(1, 'cursor must be a non-empty string');

const flagsQuerySchema = z.object({
  status: z.nativeEnum(FlagStatus).optional(),
  cursor: cursorSchema.optional(),
  limit: limitSchema
});

const resolveSchema = z.object({
  status: z.enum([FlagStatus.TRIAGED, FlagStatus.RESOLVED]),
  resolutionNotes: z
    .string()
    .trim()
    .min(1, 'resolutionNotes cannot be empty when provided')
    .max(500, 'resolutionNotes must be 500 characters or fewer')
    .optional(),
  metadata: z
    .object({})
    .catchall(z.unknown())
    .refine((value) => !Array.isArray(value), 'metadata must be an object')
    .optional()
});

const auditQuerySchema = z.object({
  actorId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: cursorSchema.optional(),
  limit: limitSchema
});

const ASSIGNABLE_ROLES: Role[] = [Role.ADMIN, Role.MODERATOR, Role.PRACTITIONER];

const roleUpdateSchema = z
  .object({
    role: z.nativeEnum(Role)
  })
  .superRefine((data, ctx) => {
    const role = data.role as Role;
    if (!ASSIGNABLE_ROLES.includes(role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'role must be ADMIN, MODERATOR, or PRACTITIONER',
        path: ['role']
      });
    }
  });

const historyQuerySchema = z.object({
  limit: limitSchema,
  cursor: cursorSchema.optional()
});

const validate = <T>(schema: z.ZodType<T>, payload: unknown): T => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
};

const router = Router();

router.get('/access', requireAuth, (req, res) => {
  const userRole = req.user?.role ?? Role.MEMBER;
  const staffRoles = new Set<Role>([Role.ADMIN, Role.MODERATOR]);
  const hasStaffAccess = staffRoles.has(userRole);
  const hasAdminAccess = userRole === Role.ADMIN;

  res.status(200).json({
    role: userRole,
    hasStaffAccess,
    hasAdminAccess,
    allowedViews: hasStaffAccess
      ? ['overview', 'users', 'health', 'database', 'config', 'security', 'apikeys', 'llm', 'audit', 'metrics', 'backups']
      : [],
    checkedAt: new Date().toISOString()
  });
});

router.use(requireAuth, requireRoles(Role.ADMIN, Role.MODERATOR));

router.get('/flags', async (req, res, next) => {
  try {
    const query = validate(flagsQuerySchema, req.query) as ListFlagsOptions;
    const data = await adminService.listFlags(query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/flags/:flagId', async (req, res, next) => {
  try {
    const data = await adminService.getFlag(req.params.flagId);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/flags/:flagId/resolve', async (req, res, next) => {
  try {
    const payload = validate(resolveSchema, req.body) as ResolveFlagInput;
    const result = await adminService.resolveFlag(
      req.user!,
      req.params.flagId,
      {
        status: payload.status,
        resolutionNotes: payload.resolutionNotes ?? null,
        metadata: payload.metadata ? (payload.metadata as Record<string, unknown>) : null
      }
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    const query = validate(auditQuerySchema, req.query) as AuditLogFilters;
    const data = await adminService.listAuditLogs(query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/roles', async (_req, res, next) => {
  try {
    const assignments = await adminService.listRoleAssignments();
    res.status(200).json(assignments);
  } catch (error) {
    next(error);
  }
});

router.post('/roles/:userId', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      throw new HttpError(403, 'Only admins may manage staff roles', 'FORBIDDEN');
    }

    const payload = validate(roleUpdateSchema, req.body) as RoleUpdateInput;
    const result = await adminService.updateUserRole(req.user, req.params.userId, payload);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/roles/:userId/history', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      throw new HttpError(403, 'Only admins may view role history', 'FORBIDDEN');
    }

    const query = validate(historyQuerySchema, req.query) as RoleHistoryOptions;
    const data = await adminService.getRoleHistory(req.params.userId, query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/system-health', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      throw new HttpError(403, 'Only admins may view system health summaries', 'FORBIDDEN');
    }

    const summary = await adminService.getSystemHealthSummary();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

export const adminRouter = router;
