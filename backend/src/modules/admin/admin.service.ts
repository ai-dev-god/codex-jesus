import { FlagStatus, FlagTargetType, Prisma, Role, type CloudTaskMetadata, type PrismaClient, type User } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';

type AuthenticatedUser = Express.AuthenticatedUser;

type PaginationMeta = {
  nextCursor: string | null;
  hasMore: boolean;
};

type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

type CommentTarget = {
  type: 'COMMENT';
  id: string;
  body: string;
  postId: string | null;
  author: UserSummary | null;
};

type PostTarget = {
  type: 'POST';
  id: string;
  body: string;
  author: UserSummary | null;
};

type InsightTarget = {
  type: 'INSIGHT';
  id: string;
  title: string | null;
  summary: string | null;
  author: UserSummary | null;
};

type BiomarkerTarget = {
  type: 'BIOMARKER_LOG';
  id: string;
  biomarker: {
    id: string;
    name: string;
    unit: string;
  } | null;
  value: number | null;
  capturedAt: string | null;
  owner: UserSummary | null;
};

type FlagTargetSummary = CommentTarget | PostTarget | InsightTarget | BiomarkerTarget | null;

type FlagAuditEvent = {
  status: FlagStatus;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  actorId: string | null;
  occurredAt: string;
};

type FlagAuditTrail = {
  events: FlagAuditEvent[];
};

export type AdminFlagDto = {
  id: string;
  status: FlagStatus;
  reason: string;
  targetType: FlagTargetType;
  target: FlagTargetSummary;
  openedBy: UserSummary;
  resolvedBy: UserSummary | null;
  resolvedAt: string | null;
  auditTrail: FlagAuditTrail | null;
  createdAt: string;
  updatedAt: string;
};

export type ListFlagsOptions = {
  status?: FlagStatus;
  cursor?: string;
  limit: number;
};

export type ResolveFlagInput = {
  status: 'TRIAGED' | 'RESOLVED';
  resolutionNotes: string | null;
  metadata: Record<string, unknown> | null;
};

export type AuditLogFilters = {
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  actor: UserSummary;
  createdAt: string;
};

export type RoleAssignment = {
  user: UserSummary & { status: User['status'] };
  recentHistory: RoleAssignmentEvent[];
};

export type RoleAssignmentEvent = {
  id: string;
  action: string;
  actor: UserSummary;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type RoleHistoryOptions = {
  limit: number;
  cursor?: string;
};

export type RoleUpdateInput = {
  role: Role;
};

export type SystemHealthSummary = {
  generatedAt: string;
  queues: {
    totalPending: number;
    insights: QueueLagSummary;
    whoop: QueueLagSummary;
    otherQueues: Record<string, QueueLagSummary>;
  };
  sync: {
    pendingConnections: number;
    staleConnections: number;
  };
  ai: {
    jobsLast24h: number;
    failedJobsLast24h: number;
    retriesLast24h: number;
    retryRate: number;
  };
};

type QueueLagSummary = {
  pending: number;
  maxLagSeconds: number;
  averageLagSeconds: number;
};

type AdminServiceOptions = Partial<{
  now: () => Date;
}>;

const ASSIGNABLE_ROLES: Role[] = [Role.ADMIN, Role.MODERATOR, Role.PRACTITIONER];

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
} as const;

type FlagRecord = Prisma.FlagGetPayload<{ include: typeof FLAG_INCLUDE }>;

const AUDIT_INCLUDE = {
  actor: {
    include: {
      profile: true
    }
  }
} as const;

type AuditRecord = Prisma.AdminAuditLogGetPayload<{ include: typeof AUDIT_INCLUDE }>;

const cloneAsJsonValue = (value: unknown): Prisma.JsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;

const toInputJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const buildUserSummary = (user: Pick<User, 'id' | 'email' | 'role' | 'status'> & {
  profile: { displayName: string | null } | null;
}): UserSummary & { status: User['status'] } => {
  const displayName = user.profile?.displayName ?? user.email ?? 'Unknown User';

  return {
    id: user.id,
    email: user.email ?? 'unknown',
    displayName,
    role: user.role,
    status: user.status
  };
};

const buildNullableSummary = (
  user: (Pick<User, 'id' | 'email' | 'role' | 'status'> & { profile: { displayName: string | null } | null }) | null
): UserSummary | null => {
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

const normaliseAuditTrail = (trail: FlagRecord['auditTrail']): FlagAuditTrail | null => {
  if (!trail || typeof trail !== 'object') {
    return null;
  }

  const events: FlagAuditEvent[] = [];
  const rawEvents = (trail as { events?: unknown }).events;
  if (Array.isArray(rawEvents)) {
    for (const entry of rawEvents) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const status = (entry as Record<string, unknown>).status;
      const occurredAt = (entry as Record<string, unknown>).occurredAt;

      if (status !== FlagStatus.OPEN && status !== FlagStatus.TRIAGED && status !== FlagStatus.RESOLVED) {
        continue;
      }

      if (typeof occurredAt !== 'string') {
        continue;
      }

      const notes = (entry as Record<string, unknown>).notes;
      const metadata = (entry as Record<string, unknown>).metadata;
      const actorId = (entry as Record<string, unknown>).actorId;
      events.push({
        status,
        notes: typeof notes === 'string' ? notes : null,
        metadata:
          metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
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

const toTargetSummary = (flag: FlagRecord): FlagTargetSummary => {
  if (flag.targetType === FlagTargetType.COMMENT) {
    const comment = flag.comment;
    if (!comment) {
      return null;
    }

    return {
      type: 'COMMENT',
      id: comment.id,
      body: comment.body ?? '',
      postId: comment.postId ?? null,
      author: buildNullableSummary(comment.author as unknown as User & { profile: { displayName: string | null } | null })
    };
  }

  if (flag.targetType === FlagTargetType.POST) {
    const post = flag.post;
    if (!post) {
      return null;
    }

    return {
      type: 'POST',
      id: post.id,
      body: post.body ?? '',
      author: buildNullableSummary(post.author as unknown as User & { profile: { displayName: string | null } | null })
    };
  }

  if (flag.targetType === FlagTargetType.INSIGHT) {
    const insight = flag.insight;
    if (!insight) {
      return null;
    }

    return {
      type: 'INSIGHT',
      id: insight.id,
      title: insight.title ?? null,
      summary: insight.summary ?? null,
      author: buildNullableSummary(insight.user as unknown as User & { profile: { displayName: string | null } | null })
    };
  }

  if (flag.targetType === FlagTargetType.BIOMARKER_LOG) {
    const log = flag.biomarkerLog;
    if (!log) {
      return null;
    }

    const value =
      log.value instanceof Prisma.Decimal
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
      owner: buildNullableSummary(log.user as unknown as User & { profile: { displayName: string | null } | null })
    };
  }

  return null;
};

const parseFlagAuditTrail = (existing: FlagRecord['auditTrail']): FlagAuditEvent[] => {
  const normalised = normaliseAuditTrail(existing);
  return normalised?.events ?? [];
};

const sanitiseMetadata = (metadata: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
};

const buildQueueSummary = (lags: number[]): QueueLagSummary => {
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

const extractRetryCount = (payload: unknown): number => {
  if (!payload || typeof payload !== 'object') {
    return 0;
  }

  const metrics = (payload as { metrics?: unknown }).metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return 0;
  }

  const retryCount = (metrics as Record<string, unknown>).retryCount;
  return typeof retryCount === 'number' && Number.isFinite(retryCount) ? retryCount : 0;
};

export class AdminService {
  private readonly now: () => Date;

  constructor(private readonly prisma: PrismaClient, options: AdminServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async listFlags(options: ListFlagsOptions): Promise<{ data: AdminFlagDto[]; meta: PaginationMeta }> {
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

  async getFlag(flagId: string): Promise<AdminFlagDto> {
    const flag = await this.prisma.flag.findUnique({
      where: { id: flagId },
      include: FLAG_INCLUDE
    });

    if (!flag) {
      throw new HttpError(404, 'Flag not found', 'FLAG_NOT_FOUND');
    }

    return this.mapFlag(flag);
  }

  async resolveFlag(
    actor: AuthenticatedUser,
    flagId: string,
    input: ResolveFlagInput
  ): Promise<AdminFlagDto> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.flag.findUnique({
        where: { id: flagId },
        include: FLAG_INCLUDE
      });

      if (!existing) {
        throw new HttpError(404, 'Flag not found', 'FLAG_NOT_FOUND');
      }

      const now = this.now();
      const previousEvents = parseFlagAuditTrail(existing.auditTrail);
      const nextEvents: FlagAuditEvent[] = [
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
          action: input.status === FlagStatus.RESOLVED ? 'FLAG_RESOLVED' : 'FLAG_TRIAGED',
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

  async listAuditLogs(filters: AuditLogFilters): Promise<{ data: AuditLogEntry[]; meta: PaginationMeta }> {
    const where: Prisma.AdminAuditLogWhereInput = {};
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

  async listRoleAssignments(): Promise<{ data: RoleAssignment[] }> {
    const staff = await this.prisma.user.findMany({
      where: {
        role: {
          in: [Role.PRACTITIONER, Role.MODERATOR, Role.ADMIN]
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

    const results: RoleAssignment[] = [];

    for (const user of staff) {
      const recentHistory = await this.fetchRoleHistory(user.id, 5);
      results.push({
        user: buildUserSummary(user),
        recentHistory
      });
    }

    return { data: results };
  }

  async updateUserRole(
    actor: AuthenticatedUser,
    userId: string,
    input: RoleUpdateInput
  ): Promise<RoleAssignment> {
    if (actor.role !== Role.ADMIN) {
      throw new HttpError(403, 'Only admins may manage staff roles', 'FORBIDDEN');
    }

    if (!ASSIGNABLE_ROLES.includes(input.role)) {
      throw new HttpError(422, 'role must be ADMIN, MODERATOR, or PRACTITIONER', 'INVALID_ROLE');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!existing) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
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

  async getRoleHistory(userId: string, options: RoleHistoryOptions): Promise<{
    data: RoleAssignmentEvent[];
    meta: PaginationMeta;
  }> {
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

  async getSystemHealthSummary(): Promise<SystemHealthSummary> {
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

  private mapFlag(flag: FlagRecord): AdminFlagDto {
    const openedBy = buildUserSummary(flag.openedBy as unknown as User & { profile: { displayName: string | null } | null });
    const resolvedBy = buildNullableSummary(flag.resolvedBy as unknown as User & {
      profile: { displayName: string | null } | null;
    });

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

  private mapAuditRecord(record: AuditRecord): AuditLogEntry {
    return {
      id: record.id,
      action: record.action,
      targetType: record.targetType,
      targetId: record.targetId,
      metadata:
        record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? (cloneAsJsonValue(record.metadata) as Record<string, unknown>)
          : null,
      actor: buildUserSummary(record.actor as unknown as User & { profile: { displayName: string | null } | null }),
      createdAt: record.createdAt.toISOString()
    };
  }

  private mapRoleEvent(record: AuditRecord): RoleAssignmentEvent {
    return {
      id: record.id,
      action: record.action,
      actor: buildUserSummary(record.actor as unknown as User & { profile: { displayName: string | null } | null }),
      metadata:
        record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
          ? (cloneAsJsonValue(record.metadata) as Record<string, unknown>)
          : null,
      createdAt: record.createdAt.toISOString()
    };
  }

  private async fetchRoleHistory(userId: string, limit: number): Promise<RoleAssignmentEvent[]> {
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

  private computeQueueStats(
    now: Date,
    records: Pick<CloudTaskMetadata, 'queue' | 'scheduleTime' | 'createdAt' | 'firstAttemptAt'>[]
  ): SystemHealthSummary['queues'] {
    const lagBuckets = new Map<string, number[]>();

    for (const record of records) {
      const reference = record.scheduleTime ?? record.createdAt ?? now;
      const lagMs = Math.max(0, now.getTime() - reference.getTime());
      const bucket = lagBuckets.get(record.queue) ?? [];
      bucket.push(lagMs);
      lagBuckets.set(record.queue, bucket);
    }

    const insightsLags = lagBuckets.get('insights-generate') ?? [];
    const whoopLags = lagBuckets.get('whoop-sync') ?? [];

    const otherQueues: Record<string, QueueLagSummary> = {};
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

  private computeSyncSummary(
    now: Date,
    integrations: { syncStatus: string; lastSyncedAt: Date | null }[]
  ): SystemHealthSummary['sync'] {
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

  private computeAiSummary(
    jobs: { status: string; payload: Prisma.JsonValue }[]
  ): SystemHealthSummary['ai'] {
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

export const adminService = new AdminService(prismaClient);
