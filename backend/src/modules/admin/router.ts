import { Router } from 'express';
import { AdminBackupType, FlagStatus, Role, ServiceApiKeyScope, UserStatus } from '@prisma/client';
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

const managedUsersQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .optional(),
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  cursor: cursorSchema.optional(),
  limit: limitSchema
});

const dsarListQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema
});

const createManagedUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  role: z.nativeEnum(Role),
  status: z.nativeEnum(UserStatus).optional(),
  timezone: z.string().trim().min(1).optional()
});

const updateManagedUserSchema = z
  .object({
    fullName: z.string().trim().min(1).optional(),
    role: z.nativeEnum(Role).optional(),
    status: z.nativeEnum(UserStatus).optional()
  })
  .refine((payload) => Boolean(payload.fullName || payload.role || payload.status), {
    message: 'At least one field must be provided'
  });

const updateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus)
});

const backupTriggerSchema = z.object({
  type: z.nativeEnum(AdminBackupType).optional()
});

const backupSettingsSchema = z.object({
  autoBackupEnabled: z.boolean(),
  frequency: z.enum(['hourly', 'six_hours', 'daily', 'weekly'])
});

const createApiKeySchema = z.object({
  name: z.string().trim().min(3).max(100),
  scope: z.nativeEnum(ServiceApiKeyScope).default(ServiceApiKeyScope.READ)
});

const validate = <Schema extends z.ZodTypeAny>(schema: Schema, payload: unknown): z.infer<Schema> => {
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

router.get('/users', async (req, res, next) => {
  try {
    const query = validate(managedUsersQuerySchema, req.query);
    const data = await adminService.listManagedUsers(query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const payload = validate(createManagedUserSchema, req.body);
    const result = await adminService.createManagedUser(req.user!, payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/users/:userId', async (req, res, next) => {
  try {
    const payload = validate(updateManagedUserSchema, req.body);
    const user = await adminService.updateManagedUser(req.user!, req.params.userId, payload);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:userId', async (req, res, next) => {
  try {
    await adminService.deleteManagedUser(req.user!, req.params.userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/users/:userId/status', async (req, res, next) => {
  try {
    const payload = validate(updateUserStatusSchema, req.body);
    const user = await adminService.setManagedUserStatus(req.user!, req.params.userId, payload.status);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/users/:userId/suspend', async (req, res, next) => {
  try {
    const user = await adminService.setManagedUserStatus(req.user!, req.params.userId, UserStatus.SUSPENDED);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/users/:userId/activate', async (req, res, next) => {
  try {
    const user = await adminService.setManagedUserStatus(req.user!, req.params.userId, UserStatus.ACTIVE);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      throw new HttpError(403, 'Only admins may view system overview', 'FORBIDDEN');
    }
    const data = await adminService.getSystemOverview();
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/metrics/system', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      throw new HttpError(403, 'Only admins may view system metrics', 'FORBIDDEN');
    }
    const data = await adminService.getSystemMetrics();
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/config', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      throw new HttpError(403, 'Only admins may view app config', 'FORBIDDEN');
    }
    const data = await adminService.getAppConfig();
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

router.get('/database/status', async (_req, res, next) => {
  try {
    const status = await adminService.getDatabaseStatus();
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.get('/llm/metrics', async (req, res, next) => {
  try {
    const windowDays =
      typeof req.query.windowDays === 'string' && req.query.windowDays.trim().length > 0
        ? Number(req.query.windowDays)
        : undefined;
    const metrics = await adminService.getLlmUsageMetrics({ windowDays });
    res.status(200).json(metrics);
  } catch (error) {
    next(error);
  }
});

router.get('/backups', async (_req, res, next) => {
  try {
    const data = await adminService.listBackupJobs();
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/backups', async (req, res, next) => {
  try {
    const payload = validate(backupTriggerSchema, req.body);
    const job = await adminService.triggerBackupJob(req.user!, payload.type ?? AdminBackupType.FULL);
    res.status(201).json(job);
  } catch (error) {
    next(error);
  }
});

router.delete('/backups/:backupId', async (req, res, next) => {
  try {
    await adminService.deleteBackupJob(req.user!, req.params.backupId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/backups/:backupId/restore', async (req, res, next) => {
  try {
    const job = await adminService.requestBackupRestore(req.user!, req.params.backupId);
    res.status(200).json(job);
  } catch (error) {
    next(error);
  }
});

router.get('/backups/:backupId/download', async (req, res, next) => {
  try {
    const link = await adminService.getBackupDownloadLink(req.params.backupId);
    res.status(200).json(link);
  } catch (error) {
    next(error);
  }
});

router.get('/backups/settings', async (_req, res, next) => {
  try {
    const settings = await adminService.getBackupSettings();
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
});

router.post('/backups/settings', async (req, res, next) => {
  try {
    const payload = validate(backupSettingsSchema, req.body);
    const settings = await adminService.updateBackupSettings(req.user!, payload);
    res.status(200).json(settings);
  } catch (error) {
    next(error);
  }
});

router.get('/api-keys', async (_req, res, next) => {
  try {
    const data = await adminService.listApiKeys();
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/api-keys', async (req, res, next) => {
  try {
    const payload = validate(createApiKeySchema, req.body);
    const result = await adminService.createApiKey(req.user!, payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/api-keys/:keyId/rotate', async (req, res, next) => {
  try {
    const result = await adminService.rotateApiKey(req.user!, req.params.keyId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/api-keys/:keyId/revoke', async (req, res, next) => {
  try {
    const key = await adminService.revokeApiKey(req.user!, req.params.keyId);
    res.status(200).json(key);
  } catch (error) {
    next(error);
  }
});

router.get('/privacy/data-exports', async (req, res, next) => {
  try {
    const query = validate(dsarListQuerySchema, req.query);
    const data = await adminService.listDataExportJobs({
      limit: query.limit,
      cursor: query.cursor
    });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/privacy/data-deletions', async (req, res, next) => {
  try {
    const query = validate(dsarListQuerySchema, req.query);
    const data = await adminService.listDataDeletionJobs({
      limit: query.limit,
      cursor: query.cursor
    });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
});

export const adminRouter = router;
