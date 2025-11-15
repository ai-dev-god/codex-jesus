"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminService = exports.AdminService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const ASSIGNABLE_ROLES = [client_1.Role.ADMIN, client_1.Role.MODERATOR, client_1.Role.PRACTITIONER];
const FLAG_INCLUDE = {
    openedBy: {
        include: {
            profile: true
        }
    },
    resolvedBy: {
        include: {
            profile: true
        }
    },
    post: {
        include: {
            author: {
                include: {
                    profile: true
                }
            }
        }
    },
    comment: {
        include: {
            author: {
                include: {
                    profile: true
                }
            },
            post: true
        }
    },
    insight: {
        include: {
            user: {
                include: {
                    profile: true
                }
            }
        }
    },
    biomarkerLog: {
        include: {
            biomarker: true,
            user: {
                include: {
                    profile: true
                }
            }
        }
    }
};
const AUDIT_INCLUDE = {
    actor: {
        include: {
            profile: true
        }
    }
};
const cloneAsJsonValue = (value) => JSON.parse(JSON.stringify(value));
const toInputJson = (value) => JSON.parse(JSON.stringify(value));
const buildUserSummary = (user) => {
    const displayName = user.profile?.displayName ?? user.email ?? 'Unknown User';
    return {
        id: user.id,
        email: user.email ?? 'unknown',
        displayName,
        role: user.role,
        status: user.status
    };
};
const buildNullableSummary = (user) => {
    if (!user) {
        return null;
    }
    const summary = buildUserSummary(user);
    return {
        id: summary.id,
        email: summary.email,
        displayName: summary.displayName,
        role: summary.role
    };
};
const normaliseAuditTrail = (trail) => {
    if (!trail || typeof trail !== 'object') {
        return null;
    }
    const events = [];
    const rawEvents = trail.events;
    if (Array.isArray(rawEvents)) {
        for (const entry of rawEvents) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }
            const status = entry.status;
            const occurredAt = entry.occurredAt;
            if (status !== client_1.FlagStatus.OPEN && status !== client_1.FlagStatus.TRIAGED && status !== client_1.FlagStatus.RESOLVED) {
                continue;
            }
            if (typeof occurredAt !== 'string') {
                continue;
            }
            const notes = entry.notes;
            const metadata = entry.metadata;
            const actorId = entry.actorId;
            events.push({
                status,
                notes: typeof notes === 'string' ? notes : null,
                metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
                    ? metadata
                    : null,
                actorId: typeof actorId === 'string' ? actorId : null,
                occurredAt
            });
        }
    }
    return {
        events
    };
};
const toTargetSummary = (flag) => {
    if (flag.targetType === client_1.FlagTargetType.COMMENT) {
        const comment = flag.comment;
        if (!comment) {
            return null;
        }
        return {
            type: 'COMMENT',
            id: comment.id,
            body: comment.body ?? '',
            postId: comment.postId ?? null,
            author: buildNullableSummary(comment.author)
        };
    }
    if (flag.targetType === client_1.FlagTargetType.POST) {
        const post = flag.post;
        if (!post) {
            return null;
        }
        return {
            type: 'POST',
            id: post.id,
            body: post.body ?? '',
            author: buildNullableSummary(post.author)
        };
    }
    if (flag.targetType === client_1.FlagTargetType.INSIGHT) {
        const insight = flag.insight;
        if (!insight) {
            return null;
        }
        return {
            type: 'INSIGHT',
            id: insight.id,
            title: insight.title ?? null,
            summary: insight.summary ?? null,
            author: buildNullableSummary(insight.user)
        };
    }
    if (flag.targetType === client_1.FlagTargetType.BIOMARKER_LOG) {
        const log = flag.biomarkerLog;
        if (!log) {
            return null;
        }
        const value = log.value instanceof client_1.Prisma.Decimal
            ? log.value.toNumber()
            : typeof log.value === 'number'
                ? log.value
                : null;
        return {
            type: 'BIOMARKER_LOG',
            id: log.id,
            biomarker: log.biomarker
                ? {
                    id: log.biomarker.id,
                    name: log.biomarker.name,
                    unit: log.biomarker.unit
                }
                : null,
            value,
            capturedAt: log.capturedAt ? log.capturedAt.toISOString() : null,
            owner: buildNullableSummary(log.user)
        };
    }
    return null;
};
const parseFlagAuditTrail = (existing) => {
    const normalised = normaliseAuditTrail(existing);
    return normalised?.events ?? [];
};
const sanitiseMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
    }
    return JSON.parse(JSON.stringify(metadata));
};
const buildQueueSummary = (lags) => {
    if (lags.length === 0) {
        return {
            pending: 0,
            maxLagSeconds: 0,
            averageLagSeconds: 0
        };
    }
    const pending = lags.length;
    const maxLag = Math.max(...lags);
    const averageLag = lags.reduce((sum, value) => sum + value, 0) / pending;
    return {
        pending,
        maxLagSeconds: Math.round(maxLag / 1000),
        averageLagSeconds: Math.round(averageLag / 1000)
    };
};
const extractRetryCount = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return 0;
    }
    const metrics = payload.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
        return 0;
    }
    const retryCount = metrics.retryCount;
    return typeof retryCount === 'number' && Number.isFinite(retryCount) ? retryCount : 0;
};
class AdminService {
    constructor(prisma, options = {}) {
        this.prisma = prisma;
        this.now = options.now ?? (() => new Date());
    }
    async listFlags(options) {
        const take = options.limit;
        const flags = await this.prisma.flag.findMany({
            where: {
                status: options.status
            },
            include: FLAG_INCLUDE,
            orderBy: { createdAt: 'desc' },
            cursor: options.cursor ? { id: options.cursor } : undefined,
            skip: options.cursor ? 1 : 0,
            take: take + 1
        });
        const items = flags.slice(0, take).map((flag) => this.mapFlag(flag));
        const nextCursor = flags.length > take ? flags[take].id : null;
        return {
            data: items,
            meta: {
                nextCursor,
                hasMore: nextCursor !== null
            }
        };
    }
    async getFlag(flagId) {
        const flag = await this.prisma.flag.findUnique({
            where: { id: flagId },
            include: FLAG_INCLUDE
        });
        if (!flag) {
            throw new http_error_1.HttpError(404, 'Flag not found', 'FLAG_NOT_FOUND');
        }
        return this.mapFlag(flag);
    }
    async resolveFlag(actor, flagId, input) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.flag.findUnique({
                where: { id: flagId },
                include: FLAG_INCLUDE
            });
            if (!existing) {
                throw new http_error_1.HttpError(404, 'Flag not found', 'FLAG_NOT_FOUND');
            }
            const now = this.now();
            const previousEvents = parseFlagAuditTrail(existing.auditTrail);
            const nextEvents = [
                ...previousEvents,
                {
                    status: input.status,
                    notes: input.resolutionNotes,
                    metadata: sanitiseMetadata(input.metadata),
                    actorId: actor.id,
                    occurredAt: now.toISOString()
                }
            ];
            const updateData = {
                status: input.status,
                auditTrail: toInputJson({
                    events: nextEvents
                }),
                ...(input.status === 'RESOLVED'
                    ? { resolvedById: actor.id, resolvedAt: now }
                    : { resolvedById: null, resolvedAt: null })
            };
            const updated = await tx.flag.update({
                where: { id: flagId },
                data: updateData,
                include: FLAG_INCLUDE
            });
            await tx.adminAuditLog.create({
                data: {
                    actorId: actor.id,
                    action: input.status === client_1.FlagStatus.RESOLVED ? 'FLAG_RESOLVED' : 'FLAG_TRIAGED',
                    targetType: 'FLAG',
                    targetId: flagId,
                    metadata: toInputJson({
                        status: input.status,
                        notes: input.resolutionNotes,
                        metadata: sanitiseMetadata(input.metadata),
                        previousStatus: existing.status
                    })
                }
            });
            return this.mapFlag(updated);
        });
    }
    async listAuditLogs(filters) {
        const where = {};
        if (filters.actorId) {
            where.actorId = filters.actorId;
        }
        if (filters.action) {
            where.action = filters.action;
        }
        if (filters.from || filters.to) {
            where.createdAt = {};
            if (filters.from) {
                where.createdAt.gte = filters.from;
            }
            if (filters.to) {
                where.createdAt.lte = filters.to;
            }
        }
        const records = await this.prisma.adminAuditLog.findMany({
            where,
            include: AUDIT_INCLUDE,
            orderBy: { createdAt: 'desc' },
            cursor: filters.cursor ? { id: filters.cursor } : undefined,
            skip: filters.cursor ? 1 : 0,
            take: filters.limit + 1
        });
        const entries = records.slice(0, filters.limit).map((record) => this.mapAuditRecord(record));
        const nextCursor = records.length > filters.limit ? records[filters.limit].id : null;
        return {
            data: entries,
            meta: {
                nextCursor,
                hasMore: nextCursor !== null
            }
        };
    }
    async listRoleAssignments() {
        const staff = await this.prisma.user.findMany({
            where: {
                role: {
                    in: [client_1.Role.PRACTITIONER, client_1.Role.MODERATOR, client_1.Role.ADMIN]
                }
            },
            include: {
                profile: true
            },
            orderBy: [
                { role: 'desc' },
                { email: 'asc' }
            ]
        });
        const results = [];
        for (const user of staff) {
            const recentHistory = await this.fetchRoleHistory(user.id, 5);
            results.push({
                user: buildUserSummary(user),
                recentHistory
            });
        }
        return { data: results };
    }
    async updateUserRole(actor, userId, input) {
        if (actor.role !== client_1.Role.ADMIN) {
            throw new http_error_1.HttpError(403, 'Only admins may manage staff roles', 'FORBIDDEN');
        }
        if (!ASSIGNABLE_ROLES.includes(input.role)) {
            throw new http_error_1.HttpError(422, 'role must be ADMIN, MODERATOR, or PRACTITIONER', 'INVALID_ROLE');
        }
        const existing = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
        if (!existing) {
            throw new http_error_1.HttpError(404, 'User not found', 'USER_NOT_FOUND');
        }
        let updated = existing;
        if (existing.role !== input.role) {
            updated = await this.prisma.$transaction(async (tx) => {
                const saved = await tx.user.update({
                    where: { id: userId },
                    data: { role: input.role },
                    include: { profile: true }
                });
                await tx.adminAuditLog.create({
                    data: {
                        actorId: actor.id,
                        action: 'USER_ROLE_UPDATED',
                        targetType: 'USER_ROLE',
                        targetId: userId,
                        metadata: toInputJson({
                            previousRole: existing.role,
                            nextRole: input.role
                        })
                    }
                });
                return saved;
            });
        }
        const recentHistory = await this.fetchRoleHistory(userId, 5);
        return {
            user: buildUserSummary(updated),
            recentHistory
        };
    }
    async getRoleHistory(userId, options) {
        const records = await this.prisma.adminAuditLog.findMany({
            where: {
                targetType: 'USER_ROLE',
                targetId: userId
            },
            include: AUDIT_INCLUDE,
            orderBy: { createdAt: 'desc' },
            cursor: options.cursor ? { id: options.cursor } : undefined,
            skip: options.cursor ? 1 : 0,
            take: options.limit + 1
        });
        const entries = records.slice(0, options.limit).map((record) => this.mapRoleEvent(record));
        const nextCursor = records.length > options.limit ? records[options.limit].id : null;
        return {
            data: entries,
            meta: {
                nextCursor,
                hasMore: nextCursor !== null
            }
        };
    }
    async getSystemHealthSummary() {
        const now = this.now();
        const queueRecords = await this.prisma.cloudTaskMetadata.findMany({
            where: {
                status: {
                    in: ['PENDING', 'DISPATCHED']
                }
            },
            select: {
                id: true,
                queue: true,
                scheduleTime: true,
                createdAt: true,
                firstAttemptAt: true
            }
        });
        const queueStats = this.computeQueueStats(now, queueRecords);
        const integrations = await this.prisma.whoopIntegration.findMany({
            select: {
                id: true,
                syncStatus: true,
                lastSyncedAt: true
            }
        });
        const syncSummary = this.computeSyncSummary(now, integrations);
        const insightJobs = await this.prisma.insightGenerationJob.findMany({
            where: {
                createdAt: {
                    gte: new Date(now.getTime() - 24 * 60 * 60 * 1000)
                }
            },
            select: {
                id: true,
                status: true,
                payload: true
            }
        });
        const aiSummary = this.computeAiSummary(insightJobs);
        return {
            generatedAt: now.toISOString(),
            queues: queueStats,
            sync: syncSummary,
            ai: aiSummary
        };
    }
    mapFlag(flag) {
        const openedBy = buildUserSummary(flag.openedBy);
        const resolvedBy = buildNullableSummary(flag.resolvedBy);
        return {
            id: flag.id,
            status: flag.status,
            reason: flag.reason,
            targetType: flag.targetType,
            target: toTargetSummary(flag),
            openedBy,
            resolvedBy,
            resolvedAt: flag.resolvedAt ? flag.resolvedAt.toISOString() : null,
            auditTrail: normaliseAuditTrail(flag.auditTrail),
            createdAt: flag.createdAt.toISOString(),
            updatedAt: flag.updatedAt.toISOString()
        };
    }
    mapAuditRecord(record) {
        return {
            id: record.id,
            action: record.action,
            targetType: record.targetType,
            targetId: record.targetId,
            metadata: record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
                ? cloneAsJsonValue(record.metadata)
                : null,
            actor: buildUserSummary(record.actor),
            createdAt: record.createdAt.toISOString()
        };
    }
    mapRoleEvent(record) {
        return {
            id: record.id,
            action: record.action,
            actor: buildUserSummary(record.actor),
            metadata: record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
                ? cloneAsJsonValue(record.metadata)
                : null,
            createdAt: record.createdAt.toISOString()
        };
    }
    async fetchRoleHistory(userId, limit) {
        const records = await this.prisma.adminAuditLog.findMany({
            where: {
                targetType: 'USER_ROLE',
                targetId: userId
            },
            include: AUDIT_INCLUDE,
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return records.map((record) => this.mapRoleEvent(record));
    }
    computeQueueStats(now, records) {
        const lagBuckets = new Map();
        for (const record of records) {
            const reference = record.scheduleTime ?? record.createdAt ?? now;
            const lagMs = Math.max(0, now.getTime() - reference.getTime());
            const bucket = lagBuckets.get(record.queue) ?? [];
            bucket.push(lagMs);
            lagBuckets.set(record.queue, bucket);
        }
        const insightsLags = lagBuckets.get('insights-generate') ?? [];
        const whoopLags = lagBuckets.get('whoop-sync') ?? [];
        const otherQueues = {};
        for (const [queue, lags] of lagBuckets.entries()) {
            if (queue === 'insights-generate' || queue === 'whoop-sync') {
                continue;
            }
            otherQueues[queue] = buildQueueSummary(lags);
        }
        return {
            totalPending: records.length,
            insights: buildQueueSummary(insightsLags),
            whoop: buildQueueSummary(whoopLags),
            otherQueues
        };
    }
    computeSyncSummary(now, integrations) {
        const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        let pendingConnections = 0;
        let staleConnections = 0;
        for (const integration of integrations) {
            if (integration.syncStatus === 'PENDING') {
                pendingConnections += 1;
            }
            if (!integration.lastSyncedAt || integration.lastSyncedAt < staleThreshold) {
                staleConnections += 1;
            }
        }
        return {
            pendingConnections,
            staleConnections
        };
    }
    computeAiSummary(jobs) {
        const jobsLast24h = jobs.length;
        let failedJobsLast24h = 0;
        let retriesLast24h = 0;
        for (const job of jobs) {
            if (job.status === 'FAILED') {
                failedJobsLast24h += 1;
            }
            retriesLast24h += extractRetryCount(job.payload);
        }
        const retryRate = jobsLast24h > 0 ? Number((retriesLast24h / jobsLast24h).toFixed(2)) : 0;
        return {
            jobsLast24h,
            failedJobsLast24h,
            retriesLast24h,
            retryRate
        };
    }
}
exports.AdminService = AdminService;
exports.adminService = new AdminService(prisma_1.default);
