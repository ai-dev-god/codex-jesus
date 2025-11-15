"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const admin_service_1 = require("./admin.service");
const limitSchema = zod_1.z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
        return 20;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}, zod_1.z
    .number({ invalid_type_error: 'limit must be a number' })
    .int()
    .min(1, 'limit must be at least 1')
    .max(50, 'limit must not exceed 50'));
const cursorSchema = zod_1.z.string().trim().min(1, 'cursor must be a non-empty string');
const flagsQuerySchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.FlagStatus).optional(),
    cursor: cursorSchema.optional(),
    limit: limitSchema
});
const resolveSchema = zod_1.z.object({
    status: zod_1.z.enum([client_1.FlagStatus.TRIAGED, client_1.FlagStatus.RESOLVED]),
    resolutionNotes: zod_1.z
        .string()
        .trim()
        .min(1, 'resolutionNotes cannot be empty when provided')
        .max(500, 'resolutionNotes must be 500 characters or fewer')
        .optional(),
    metadata: zod_1.z
        .object({})
        .catchall(zod_1.z.unknown())
        .refine((value) => !Array.isArray(value), 'metadata must be an object')
        .optional()
});
const auditQuerySchema = zod_1.z.object({
    actorId: zod_1.z.string().trim().min(1).optional(),
    action: zod_1.z.string().trim().min(1).optional(),
    from: zod_1.z.coerce.date().optional(),
    to: zod_1.z.coerce.date().optional(),
    cursor: cursorSchema.optional(),
    limit: limitSchema
});
const ASSIGNABLE_ROLES = [client_1.Role.ADMIN, client_1.Role.MODERATOR, client_1.Role.PRACTITIONER];
const roleUpdateSchema = zod_1.z
    .object({
    role: zod_1.z.nativeEnum(client_1.Role)
})
    .superRefine((data, ctx) => {
    const role = data.role;
    if (!ASSIGNABLE_ROLES.includes(role)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'role must be ADMIN, MODERATOR, or PRACTITIONER',
            path: ['role']
        });
    }
});
const historyQuerySchema = zod_1.z.object({
    limit: limitSchema,
    cursor: cursorSchema.optional()
});
const managedUsersQuerySchema = zod_1.z.object({
    search: zod_1.z
        .string()
        .trim()
        .min(1)
        .optional(),
    role: zod_1.z.nativeEnum(client_1.Role).optional(),
    status: zod_1.z.nativeEnum(client_1.UserStatus).optional(),
    cursor: cursorSchema.optional(),
    limit: limitSchema
});
const createManagedUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    fullName: zod_1.z.string().trim().min(1),
    role: zod_1.z.nativeEnum(client_1.Role),
    status: zod_1.z.nativeEnum(client_1.UserStatus).optional(),
    timezone: zod_1.z.string().trim().min(1).optional()
});
const updateManagedUserSchema = zod_1.z
    .object({
    fullName: zod_1.z.string().trim().min(1).optional(),
    role: zod_1.z.nativeEnum(client_1.Role).optional(),
    status: zod_1.z.nativeEnum(client_1.UserStatus).optional()
})
    .refine((payload) => Boolean(payload.fullName || payload.role || payload.status), {
    message: 'At least one field must be provided'
});
const updateUserStatusSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.UserStatus)
});
const backupTriggerSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.AdminBackupType).optional()
});
const backupSettingsSchema = zod_1.z.object({
    autoBackupEnabled: zod_1.z.boolean(),
    frequency: zod_1.z.enum(['hourly', 'six_hours', 'daily', 'weekly'])
});
const createApiKeySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(3).max(100),
    scope: zod_1.z.nativeEnum(client_1.ServiceApiKeyScope).default(client_1.ServiceApiKeyScope.READ)
});
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const router = (0, express_1.Router)();
router.get('/access', guards_1.requireAuth, (req, res) => {
    const userRole = req.user?.role ?? client_1.Role.MEMBER;
    const staffRoles = new Set([client_1.Role.ADMIN, client_1.Role.MODERATOR]);
    const hasStaffAccess = staffRoles.has(userRole);
    const hasAdminAccess = userRole === client_1.Role.ADMIN;
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
router.use(guards_1.requireAuth, (0, guards_1.requireRoles)(client_1.Role.ADMIN, client_1.Role.MODERATOR));
router.get('/flags', async (req, res, next) => {
    try {
        const query = validate(flagsQuerySchema, req.query);
        const data = await admin_service_1.adminService.listFlags(query);
        res.status(200).json(data);
    }
    catch (error) {
        next(error);
    }
});
router.get('/flags/:flagId', async (req, res, next) => {
    try {
        const data = await admin_service_1.adminService.getFlag(req.params.flagId);
        res.status(200).json(data);
    }
    catch (error) {
        next(error);
    }
});
router.post('/flags/:flagId/resolve', async (req, res, next) => {
    try {
        const payload = validate(resolveSchema, req.body);
        const result = await admin_service_1.adminService.resolveFlag(req.user, req.params.flagId, {
            status: payload.status,
            resolutionNotes: payload.resolutionNotes ?? null,
            metadata: payload.metadata ? payload.metadata : null
        });
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.get('/audit', async (req, res, next) => {
    try {
        const query = validate(auditQuerySchema, req.query);
        const data = await admin_service_1.adminService.listAuditLogs(query);
        res.status(200).json(data);
    }
    catch (error) {
        next(error);
    }
});
router.get('/roles', async (_req, res, next) => {
    try {
        const assignments = await admin_service_1.adminService.listRoleAssignments();
        res.status(200).json(assignments);
    }
    catch (error) {
        next(error);
    }
});
router.post('/roles/:userId', async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== client_1.Role.ADMIN) {
            throw new http_error_1.HttpError(403, 'Only admins may manage staff roles', 'FORBIDDEN');
        }
        const payload = validate(roleUpdateSchema, req.body);
        const result = await admin_service_1.adminService.updateUserRole(req.user, req.params.userId, payload);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.get('/roles/:userId/history', async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== client_1.Role.ADMIN) {
            throw new http_error_1.HttpError(403, 'Only admins may view role history', 'FORBIDDEN');
        }
        const query = validate(historyQuerySchema, req.query);
        const data = await admin_service_1.adminService.getRoleHistory(req.params.userId, query);
        res.status(200).json(data);
    }
    catch (error) {
        next(error);
    }
});
router.get('/users', async (req, res, next) => {
    try {
        const query = validate(managedUsersQuerySchema, req.query);
        const data = await admin_service_1.adminService.listManagedUsers(query);
        res.status(200).json(data);
    }
    catch (error) {
        next(error);
    }
});
router.post('/users', async (req, res, next) => {
    try {
        const payload = validate(createManagedUserSchema, req.body);
        const result = await admin_service_1.adminService.createManagedUser(req.user, payload);
        res.status(201).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.put('/users/:userId', async (req, res, next) => {
    try {
        const payload = validate(updateManagedUserSchema, req.body);
        const user = await admin_service_1.adminService.updateManagedUser(req.user, req.params.userId, payload);
        res.status(200).json(user);
    }
    catch (error) {
        next(error);
    }
});
router.delete('/users/:userId', async (req, res, next) => {
    try {
        await admin_service_1.adminService.deleteManagedUser(req.user, req.params.userId);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
router.post('/users/:userId/status', async (req, res, next) => {
    try {
        const payload = validate(updateUserStatusSchema, req.body);
        const user = await admin_service_1.adminService.setManagedUserStatus(req.user, req.params.userId, payload.status);
        res.status(200).json(user);
    }
    catch (error) {
        next(error);
    }
});
router.post('/users/:userId/suspend', async (req, res, next) => {
    try {
        const user = await admin_service_1.adminService.setManagedUserStatus(req.user, req.params.userId, client_1.UserStatus.SUSPENDED);
        res.status(200).json(user);
    }
    catch (error) {
        next(error);
    }
});
router.post('/users/:userId/activate', async (req, res, next) => {
    try {
        const user = await admin_service_1.adminService.setManagedUserStatus(req.user, req.params.userId, client_1.UserStatus.ACTIVE);
        res.status(200).json(user);
    }
    catch (error) {
        next(error);
    }
});
router.get('/system-health', async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== client_1.Role.ADMIN) {
            throw new http_error_1.HttpError(403, 'Only admins may view system health summaries', 'FORBIDDEN');
        }
        const summary = await admin_service_1.adminService.getSystemHealthSummary();
        res.status(200).json(summary);
    }
    catch (error) {
        next(error);
    }
});
router.get('/database/status', async (_req, res, next) => {
    try {
        const status = await admin_service_1.adminService.getDatabaseStatus();
        res.status(200).json(status);
    }
    catch (error) {
        next(error);
    }
});
router.get('/backups', async (_req, res, next) => {
    try {
        const data = await admin_service_1.adminService.listBackupJobs();
        res.status(200).json(data);
    }
    catch (error) {
        next(error);
    }
});
router.post('/backups', async (req, res, next) => {
    try {
        const payload = validate(backupTriggerSchema, req.body);
        const job = await admin_service_1.adminService.triggerBackupJob(req.user, payload.type ?? client_1.AdminBackupType.FULL);
        res.status(201).json(job);
    }
    catch (error) {
        next(error);
    }
});
router.delete('/backups/:backupId', async (req, res, next) => {
    try {
        await admin_service_1.adminService.deleteBackupJob(req.user, req.params.backupId);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
router.post('/backups/:backupId/restore', async (req, res, next) => {
    try {
        const job = await admin_service_1.adminService.requestBackupRestore(req.user, req.params.backupId);
        res.status(200).json(job);
    }
    catch (error) {
        next(error);
    }
});
router.get('/backups/:backupId/download', async (req, res, next) => {
    try {
        const link = await admin_service_1.adminService.getBackupDownloadLink(req.params.backupId);
        res.status(200).json(link);
    }
    catch (error) {
        next(error);
    }
});
router.get('/backups/settings', async (_req, res, next) => {
    try {
        const settings = await admin_service_1.adminService.getBackupSettings();
        res.status(200).json(settings);
    }
    catch (error) {
        next(error);
    }
});
router.post('/backups/settings', async (req, res, next) => {
    try {
        const payload = validate(backupSettingsSchema, req.body);
        const settings = await admin_service_1.adminService.updateBackupSettings(req.user, payload);
        res.status(200).json(settings);
    }
    catch (error) {
        next(error);
    }
});
router.get('/api-keys', async (_req, res, next) => {
    try {
        const data = await admin_service_1.adminService.listApiKeys();
        res.status(200).json(data);
    }
    catch (error) {
        next(error);
    }
});
router.post('/api-keys', async (req, res, next) => {
    try {
        const payload = validate(createApiKeySchema, req.body);
        const result = await admin_service_1.adminService.createApiKey(req.user, payload);
        res.status(201).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.post('/api-keys/:keyId/rotate', async (req, res, next) => {
    try {
        const result = await admin_service_1.adminService.rotateApiKey(req.user, req.params.keyId);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.post('/api-keys/:keyId/revoke', async (req, res, next) => {
    try {
        const key = await admin_service_1.adminService.revokeApiKey(req.user, req.params.keyId);
        res.status(200).json(key);
    }
    catch (error) {
        next(error);
    }
});
exports.adminRouter = router;
