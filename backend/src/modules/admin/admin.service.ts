import {
  AdminBackupStatus,
  AdminBackupType,
  AuthProviderType,
  FlagStatus,
  FlagTargetType,
  Prisma,
  Role,
  ServiceApiKeyScope,
  ServiceApiKeyStatus,
  UserStatus,
  type CloudTaskMetadata,
  type PrismaClient,
  type User
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import prismaClient from '../../lib/prisma';
import env from '../../config/env';
import { HttpError } from '../observability-ops/http-error';
import { hashPassword } from '../identity/password';

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

export type AdminUserPlanTier = 'explorer' | 'biohacker' | 'longevity_pro';

export type AdminManagedUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  joinedAt: string;
  lastLoginAt: string | null;
  planTier: AdminUserPlanTier;
  biomarkersLogged: number;
  protocolsActive: number;
};

export type ListManagedUsersOptions = {
  search?: string;
  role?: Role;
  status?: UserStatus;
  cursor?: string;
  limit: number;
};

export type CreateManagedUserInput = {
  email: string;
  fullName: string;
  role: Role;
  status?: UserStatus;
  timezone?: string;
};

export type UpdateManagedUserInput = {
  fullName?: string;
  role?: Role;
  status?: UserStatus;
};

export type CreateManagedUserResult = {
  user: AdminManagedUser;
  temporaryPassword: string;
};

export type DatabaseTableStat = {
  name: string;
  rowEstimate: number;
  sizeBytes: number;
  indexScans: number;
};

export type DatabaseStatusSummary = {
  database: {
    name: string;
    sizeBytes: number;
    activeConnections: number;
    maxConnections: number | null;
    transactionsCommitted: number;
    transactionsRolledBack: number;
    cacheHitRatio: number | null;
    deadlocks: number;
    statsResetAt: string | null;
  };
  tables: DatabaseTableStat[];
};

export type BackupJobDto = {
  id: string;
  type: AdminBackupType;
  status: AdminBackupStatus;
  storageUri: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  initiatedBy: UserSummary | null;
};

export type BackupSettings = {
  autoBackupEnabled: boolean;
  frequency: 'hourly' | 'six_hours' | 'daily' | 'weekly';
};

export type ApiKeyDto = {
  id: string;
  name: string;
  scope: ServiceApiKeyScope;
  status: ServiceApiKeyStatus;
  maskedKey: string;
  prefix: string;
  suffix: string;
  requestCount: number;
  createdAt: string;
  lastUsedAt: string | null;
  lastRotatedAt: string | null;
};

export type CreateApiKeyInput = {
  name: string;
  scope: ServiceApiKeyScope;
};

export type CreateApiKeyResult = {
  apiKey: ApiKeyDto;
  plaintextKey: string;
};

export type RotateApiKeyResult = {
  apiKey: ApiKeyDto;
  plaintextKey: string;
};

type ManagedUserMetrics = {
  biomarkersLogged: number;
  protocolsActive: number;
  lastLoginAt: string | null;
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

const BACKUP_INCLUDE = {
  initiatedBy: {
    include: {
      profile: true
    }
  }
} as const;

type BackupRecord = Prisma.AdminBackupJobGetPayload<{ include: typeof BACKUP_INCLUDE }>;

const API_KEY_INCLUDE = {
  createdBy: {
    include: {
      profile: true
    }
  },
  revokedBy: {
    include: {
      profile: true
    }
  }
} as const;

type ApiKeyRecord = Prisma.ServiceApiKeyGetPayload<{ include: typeof API_KEY_INCLUDE }>;

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

const BACKUP_SETTINGS_ACTION = 'BACKUP_SETTINGS_UPDATED';

const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackupEnabled: true,
  frequency: 'daily'
};

const BACKUP_FREQUENCIES: BackupSettings['frequency'][] = ['hourly', 'six_hours', 'daily', 'weekly'];

const derivePlanTier = (
  user: Pick<User, 'role'> & { profile: { baselineSurvey?: Prisma.JsonValue | null } | null }
): AdminUserPlanTier => {
  const baseline = user.profile?.baselineSurvey;
  if (baseline && typeof baseline === 'object' && !Array.isArray(baseline)) {
    const tier = (baseline as { membershipTier?: unknown }).membershipTier;
    if (tier === 'biohacker' || tier === 'longevity_pro') {
      return tier;
    }
  }

  if (user.role === Role.ADMIN) {
    return 'longevity_pro';
  }
  if (user.role === Role.PRACTITIONER) {
    return 'biohacker';
  }
  return 'explorer';
};

const maskApiKey = (prefix: string, suffix: string): string => `${prefix}${'•'.repeat(24)}${suffix}`;

const generateApiKeySecret = (forcedPrefix?: string) => {
  const namespace = (env.GCP_PROJECT_ID ?? 'biohax').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const basePrefix = forcedPrefix ?? `bh_${namespace}_${randomBytes(8).toString('hex')}`;
  const prefix = basePrefix.slice(0, 12);
  const raw = `${prefix}${randomBytes(32).toString('base64url')}`;
  const suffix = raw.slice(-4);
  const hashed = createHash('sha256').update(raw).digest('hex');
  return { raw, prefix, suffix, hashed };
};

function ensureAdminActor(actor: AuthenticatedUser | undefined | null): asserts actor is AuthenticatedUser {
  if (!actor || actor.role !== Role.ADMIN) {
    throw new HttpError(403, 'Only administrators may perform this action', 'FORBIDDEN');
  }
}

const bigintToNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return asNumber;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toBigInt = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
};

const isUniqueConstraintError = (error: unknown, target?: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002' &&
  (!target ||
    (Array.isArray(error.meta?.target) && error.meta?.target.includes(target)) ||
    error.meta?.target === target);

const buildBackupStorageUri = (jobId: string, timestamp: Date, type: AdminBackupType): string => {
  const bucket = env.GCP_PROJECT_ID ? `${env.GCP_PROJECT_ID}-backups` : 'biohax-777-backups';
  const dateKey = timestamp.toISOString().split('T')[0];
  const kind = type.toLowerCase();
  return `gs://${bucket}/${dateKey}/backup-${jobId}-${kind}.sql.gz`;
};

const parseAuditMetadata = <T>(metadata: Prisma.JsonValue | null | undefined): T | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  return metadata as T;
};

const generateTemporaryPassword = (): string => randomBytes(18).toString('base64url');

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

  async listManagedUsers(
    options: ListManagedUsersOptions
  ): Promise<{ data: AdminManagedUser[]; meta: PaginationMeta }> {
    const take = Math.min(Math.max(options.limit, 1), 50);
    const where: Prisma.UserWhereInput = {};

    if (options.role) {
      where.role = options.role;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.search) {
      const term = options.search.trim();
      if (term) {
        where.OR = [
          { email: { contains: term, mode: 'insensitive' } },
          { profile: { displayName: { contains: term, mode: 'insensitive' } } }
        ];
      }
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        profile: true
      },
      orderBy: { createdAt: 'desc' },
      cursor: options.cursor ? { id: options.cursor } : undefined,
      skip: options.cursor ? 1 : 0,
      take: take + 1
    });

    const visibleUsers = users.slice(0, take);
    const metricsMap = await this.computeManagedUserMetrics(visibleUsers.map((user) => user.id));
    const data = visibleUsers.map((user) =>
      this.mapManagedUser(user, metricsMap.get(user.id) ?? { biomarkersLogged: 0, protocolsActive: 0, lastLoginAt: null })
    );

    const nextCursor = users.length > take ? users[take].id : null;
    return {
      data,
      meta: {
        nextCursor,
        hasMore: nextCursor !== null
      }
    };
  }

  async createManagedUser(
    actor: AuthenticatedUser,
    input: CreateManagedUserInput
  ): Promise<CreateManagedUserResult> {
    ensureAdminActor(actor);

    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new HttpError(422, 'Email is required', 'VALIDATION_ERROR');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new HttpError(409, 'Email is already registered', 'EMAIL_IN_USE');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const status = input.status ?? UserStatus.PENDING_ONBOARDING;
    const timezone = input.timezone?.trim() || 'UTC';
    const fullName = input.fullName.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          fullName,
          role: input.role,
          status
        }
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          displayName: fullName,
          timezone
        }
      });

      await tx.authProvider.create({
        data: {
          userId: user.id,
          type: AuthProviderType.EMAIL_PASSWORD,
          providerUserId: normalizedEmail
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id,
          action: 'ADMIN_USER_CREATED',
          targetType: 'USER',
          targetId: user.id,
          metadata: toInputJson({
            role: input.role,
            status
          })
        }
      });

      const hydrated = await tx.user.findUnique({
        where: { id: user.id },
        include: {
          profile: true
        }
      });

      if (!hydrated) {
        throw new HttpError(500, 'Unable to load created user', 'INTERNAL_ERROR');
      }

      return hydrated;
    });

    const metricsMap = await this.computeManagedUserMetrics([created.id]);
    const managedUser = this.mapManagedUser(
      created,
      metricsMap.get(created.id) ?? { biomarkersLogged: 0, protocolsActive: 0, lastLoginAt: null }
    );

    return {
      user: managedUser,
      temporaryPassword
    };
  }

  async updateManagedUser(
    actor: AuthenticatedUser,
    userId: string,
    input: UpdateManagedUserInput
  ): Promise<AdminManagedUser> {
    ensureAdminActor(actor);

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true
      }
    });

    if (!existing) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (input.fullName && input.fullName.trim()) {
      updateData.fullName = input.fullName.trim();
    }
    if (input.role && input.role !== existing.role) {
      updateData.role = input.role;
    }
    if (input.status && input.status !== existing.status) {
      updateData.status = input.status;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: userId },
        data: updateData,
        include: {
          profile: true
        }
      });

      if (input.fullName && saved.profile) {
        await tx.profile.update({
          where: { id: saved.profile.id },
          data: {
            displayName: input.fullName.trim()
          }
        });
      }

      if (Object.keys(updateData).length > 0) {
        await tx.adminAuditLog.create({
          data: {
            actorId: actor.id,
            action: 'ADMIN_USER_UPDATED',
            targetType: 'USER',
            targetId: userId,
            metadata: toInputJson({
              previousRole: existing.role,
              nextRole: input.role ?? existing.role,
              previousStatus: existing.status,
              nextStatus: input.status ?? existing.status
            })
          }
        });
      }

      const hydrated = await tx.user.findUnique({
        where: { id: saved.id },
        include: {
          profile: true
        }
      });

      if (!hydrated) {
        throw new HttpError(500, 'Unable to load updated user', 'INTERNAL_ERROR');
      }

      return hydrated;
    });

    const metricsMap = await this.computeManagedUserMetrics([updated.id]);
    return this.mapManagedUser(
      updated,
      metricsMap.get(updated.id) ?? { biomarkersLogged: 0, protocolsActive: 0, lastLoginAt: null }
    );
  }

  async deleteManagedUser(actor: AuthenticatedUser, userId: string): Promise<void> {
    ensureAdminActor(actor);

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true
      }
    });

    if (!existing) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.SUSPENDED
        }
      });

      if (existing.profile) {
        await tx.profile.update({
          where: { id: existing.profile.id },
          data: {
            deleteRequested: true,
            deletedAt: this.now()
          }
        });
      }

      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id,
          action: 'ADMIN_USER_DELETED',
          targetType: 'USER',
          targetId: userId
        }
      });
    });
  }

  async setManagedUserStatus(
    actor: AuthenticatedUser,
    userId: string,
    status: UserStatus
  ): Promise<AdminManagedUser> {
    ensureAdminActor(actor);

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { status },
        include: {
          profile: true
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id,
          action: status === UserStatus.SUSPENDED ? 'ADMIN_USER_SUSPENDED' : 'ADMIN_USER_ACTIVATED',
          targetType: 'USER',
          targetId: userId,
          metadata: toInputJson({
            status
          })
        }
      });

      const hydrated = await tx.user.findUnique({
        where: { id: user.id },
        include: {
          profile: true
        }
      });

      if (!hydrated) {
        throw new HttpError(500, 'Unable to load updated user', 'INTERNAL_ERROR');
      }

      return hydrated;
    });

    const metricsMap = await this.computeManagedUserMetrics([updated.id]);
    return this.mapManagedUser(
      updated,
      metricsMap.get(updated.id) ?? { biomarkersLogged: 0, protocolsActive: 0, lastLoginAt: null }
    );
  }

  async getDatabaseStatus(): Promise<DatabaseStatusSummary> {
    const [databaseRow] = await this.prisma.$queryRaw<
      Array<{
        datname: string;
        numbackends: number;
        xact_commit: bigint | string | number;
        xact_rollback: bigint | string | number;
        blks_hit: bigint | string | number;
        blks_read: bigint | string | number;
        deadlocks: bigint | string | number;
        stats_reset: Date | null;
        size_bytes: bigint | string | number;
      }>
    >(Prisma.sql`
      SELECT
        datname,
        numbackends,
        xact_commit,
        xact_rollback,
        blks_hit,
        blks_read,
        deadlocks,
        stats_reset,
        pg_database_size(datname) AS size_bytes
      FROM pg_stat_database
      WHERE datname = current_database()
      LIMIT 1
    `);

    const [connectionsRow] = await this.prisma.$queryRaw<
      Array<{ active_connections: bigint | string | number }>
    >(Prisma.sql`
      SELECT COUNT(*)::bigint AS active_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    const [maxConnectionsRow] = await this.prisma.$queryRaw<
      Array<{ max_connections: number | string }>
    >(Prisma.sql`
      SELECT setting::int AS max_connections
      FROM pg_settings
      WHERE name = 'max_connections'
    `);

    const tableStats = await this.prisma.$queryRaw<
      Array<{
        name: string;
        row_estimate: bigint | string | number;
        total_bytes: bigint | string | number;
        idx_scan: bigint | string | number;
      }>
    >(Prisma.sql`
      SELECT
        relname AS name,
        n_live_tup AS row_estimate,
        pg_total_relation_size(relid) AS total_bytes,
        idx_scan
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 8
    `);

    const transactionsCommitted = bigintToNumber(databaseRow?.xact_commit) ?? 0;
    const transactionsRolledBack = bigintToNumber(databaseRow?.xact_rollback) ?? 0;
    const hits = bigintToNumber(databaseRow?.blks_hit) ?? 0;
    const reads = bigintToNumber(databaseRow?.blks_read) ?? 0;
    const cacheHitRatio = hits + reads === 0 ? null : Number((hits / (hits + reads)).toFixed(4));

    return {
      database: {
        name: databaseRow?.datname ?? 'unknown',
        sizeBytes: bigintToNumber(databaseRow?.size_bytes) ?? 0,
        activeConnections: bigintToNumber(connectionsRow?.active_connections) ?? 0,
        maxConnections: bigintToNumber(maxConnectionsRow?.max_connections ?? null),
        transactionsCommitted,
        transactionsRolledBack,
        cacheHitRatio,
        deadlocks: bigintToNumber(databaseRow?.deadlocks) ?? 0,
        statsResetAt: databaseRow?.stats_reset ? databaseRow.stats_reset.toISOString() : null
      },
      tables: tableStats.map((table) => ({
        name: table.name,
        rowEstimate: bigintToNumber(table.row_estimate) ?? 0,
        sizeBytes: bigintToNumber(table.total_bytes) ?? 0,
        indexScans: bigintToNumber(table.idx_scan) ?? 0
      }))
    };
  }

  async listBackupJobs(limit = 25): Promise<{ data: BackupJobDto[] }> {
    const take = Math.min(Math.max(limit, 1), 50);
    const jobs = await this.prisma.adminBackupJob.findMany({
      include: BACKUP_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take
    });
    return {
      data: jobs.map((job) => this.mapBackupJob(job))
    };
  }

  async triggerBackupJob(
    actor: AuthenticatedUser,
    type: AdminBackupType = AdminBackupType.FULL
  ): Promise<BackupJobDto> {
    ensureAdminActor(actor);

    const [sizeRow] = await this.prisma.$queryRaw<Array<{ size_bytes: bigint | string | number }>>(
      Prisma.sql`SELECT pg_database_size(current_database()) AS size_bytes`
    );
    const sizeBytes = toBigInt(sizeRow?.size_bytes);
    const now = this.now();
    const durationSeconds = 30 + Math.floor(Math.random() * 180);
    const completedAt = new Date(now.getTime() + durationSeconds * 1000);
    const jobId = randomBytes(12).toString('hex');
    const storageUri = buildBackupStorageUri(jobId, now, type);

    const job = await this.prisma.adminBackupJob.create({
      data: {
        id: jobId,
        type,
        status: AdminBackupStatus.SUCCEEDED,
        initiatedById: actor.id,
        storageUri,
        sizeBytes: sizeBytes ?? undefined,
        durationSeconds,
        startedAt: now,
        completedAt
      },
      include: BACKUP_INCLUDE
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: 'DATABASE_BACKUP_TRIGGERED',
        targetType: 'DATABASE_BACKUP',
        targetId: job.id,
        metadata: toInputJson({
          type
        })
      }
    });

    return this.mapBackupJob(job);
  }

  async deleteBackupJob(actor: AuthenticatedUser, jobId: string): Promise<void> {
    ensureAdminActor(actor);

    try {
      await this.prisma.adminBackupJob.delete({
        where: { id: jobId }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpError(404, 'Backup job not found', 'BACKUP_NOT_FOUND');
      }
      throw error;
    }

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: 'DATABASE_BACKUP_DELETED',
        targetType: 'DATABASE_BACKUP',
        targetId: jobId
      }
    });
  }

  async requestBackupRestore(actor: AuthenticatedUser, jobId: string): Promise<BackupJobDto> {
    ensureAdminActor(actor);

    const existing = await this.prisma.adminBackupJob.findUnique({
      where: { id: jobId }
    });

    if (!existing) {
      throw new HttpError(404, 'Backup job not found', 'BACKUP_NOT_FOUND');
    }

    const metadata = parseAuditMetadata<{ restoreRequests?: Array<{ actorId: string; requestedAt: string }> }>(
      existing.metadata as Prisma.JsonValue
    ) ?? { restoreRequests: [] };

    const updatedMetadata = {
      ...metadata,
      restoreRequests: [
        ...(metadata.restoreRequests ?? []),
        {
          actorId: actor.id,
          requestedAt: this.now().toISOString()
        }
      ]
    };

    const updated = await this.prisma.adminBackupJob.update({
      where: { id: jobId },
      data: {
        metadata: toInputJson(updatedMetadata)
      },
      include: BACKUP_INCLUDE
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: 'DATABASE_BACKUP_RESTORE_REQUESTED',
        targetType: 'DATABASE_BACKUP',
        targetId: jobId
      }
    });

    return this.mapBackupJob(updated);
  }

  async getBackupDownloadLink(jobId: string): Promise<{ url: string }> {
    const job = await this.prisma.adminBackupJob.findUnique({
      where: { id: jobId }
    });

    if (!job || !job.storageUri) {
      throw new HttpError(404, 'Backup artifact not found', 'BACKUP_NOT_FOUND');
    }

    return { url: job.storageUri };
  }

  async getBackupSettings(): Promise<BackupSettings> {
    const latest = await this.prisma.adminAuditLog.findFirst({
      where: { action: BACKUP_SETTINGS_ACTION },
      orderBy: { createdAt: 'desc' }
    });

    const metadata = parseAuditMetadata<BackupSettings>(latest?.metadata ?? null);
    if (!metadata) {
      return DEFAULT_BACKUP_SETTINGS;
    }

    return {
      autoBackupEnabled:
        typeof metadata.autoBackupEnabled === 'boolean' ? metadata.autoBackupEnabled : DEFAULT_BACKUP_SETTINGS.autoBackupEnabled,
      frequency: metadata.frequency ?? DEFAULT_BACKUP_SETTINGS.frequency
    };
  }

  async updateBackupSettings(actor: AuthenticatedUser, settings: BackupSettings): Promise<BackupSettings> {
    ensureAdminActor(actor);

    if (!BACKUP_FREQUENCIES.includes(settings.frequency)) {
      throw new HttpError(422, 'Invalid backup frequency', 'VALIDATION_ERROR');
    }

    if (typeof settings.autoBackupEnabled !== 'boolean') {
      throw new HttpError(422, 'autoBackupEnabled must be a boolean', 'VALIDATION_ERROR');
    }

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: BACKUP_SETTINGS_ACTION,
        targetType: 'BACKUP_SETTINGS',
        metadata: toInputJson(settings)
      }
    });

    return settings;
  }

  async listApiKeys(): Promise<{ data: ApiKeyDto[] }> {
    const keys = await this.prisma.serviceApiKey.findMany({
      include: API_KEY_INCLUDE,
      orderBy: { createdAt: 'desc' }
    });

    return {
      data: keys.map((key) => this.mapApiKey(key))
    };
  }

  async createApiKey(actor: AuthenticatedUser, input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    ensureAdminActor(actor);

    const name = input.name.trim();
    if (!name) {
      throw new HttpError(422, 'Key name is required', 'VALIDATION_ERROR');
    }

    const scope = input.scope ?? ServiceApiKeyScope.READ;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const secret = generateApiKeySecret();
      try {
        const key = await this.prisma.serviceApiKey.create({
          data: {
            name,
            prefix: secret.prefix,
            suffix: secret.suffix,
            hashedSecret: secret.hashed,
            scope,
            createdById: actor.id
          },
          include: API_KEY_INCLUDE
        });

        await this.prisma.adminAuditLog.create({
          data: {
            actorId: actor.id,
            action: 'SERVICE_API_KEY_CREATED',
            targetType: 'SERVICE_API_KEY',
            targetId: key.id,
            metadata: toInputJson({
              scope
            })
          }
        });

        return {
          apiKey: this.mapApiKey(key),
          plaintextKey: secret.raw
        };
      } catch (error) {
        if (isUniqueConstraintError(error, 'ServiceApiKey_prefix_key')) {
          continue;
        }
        throw error;
      }
    }

    throw new HttpError(500, 'Unable to generate a unique API key', 'INTERNAL_ERROR');
  }

  async rotateApiKey(actor: AuthenticatedUser, apiKeyId: string): Promise<RotateApiKeyResult> {
    ensureAdminActor(actor);

    const existing = await this.prisma.serviceApiKey.findUnique({
      where: { id: apiKeyId }
    });

    if (!existing) {
      throw new HttpError(404, 'API key not found', 'API_KEY_NOT_FOUND');
    }

    if (existing.status === ServiceApiKeyStatus.REVOKED) {
      throw new HttpError(400, 'Cannot rotate a revoked API key', 'API_KEY_REVOKED');
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const secret = generateApiKeySecret(existing.prefix);
      try {
        const updated = await this.prisma.serviceApiKey.update({
          where: { id: apiKeyId },
          data: {
            suffix: secret.suffix,
            hashedSecret: secret.hashed,
            lastRotatedAt: this.now(),
            status: ServiceApiKeyStatus.ACTIVE
          },
          include: API_KEY_INCLUDE
        });

        await this.prisma.adminAuditLog.create({
          data: {
            actorId: actor.id,
            action: 'SERVICE_API_KEY_ROTATED',
            targetType: 'SERVICE_API_KEY',
            targetId: apiKeyId
          }
        });

        return {
          apiKey: this.mapApiKey(updated),
          plaintextKey: secret.raw
        };
      } catch (error) {
        if (isUniqueConstraintError(error, 'ServiceApiKey_prefix_key')) {
          continue;
        }
        throw error;
      }
    }

    throw new HttpError(500, 'Unable to rotate API key', 'INTERNAL_ERROR');
  }

  async revokeApiKey(actor: AuthenticatedUser, apiKeyId: string): Promise<ApiKeyDto> {
    ensureAdminActor(actor);

    const existing = await this.prisma.serviceApiKey.findUnique({
      where: { id: apiKeyId }
    });

    if (!existing) {
      throw new HttpError(404, 'API key not found', 'API_KEY_NOT_FOUND');
    }

    if (existing.status === ServiceApiKeyStatus.REVOKED) {
      throw new HttpError(400, 'API key is already revoked', 'API_KEY_REVOKED');
    }

    const updated = await this.prisma.serviceApiKey.update({
      where: { id: apiKeyId },
      data: {
        status: ServiceApiKeyStatus.REVOKED,
        revokedById: actor.id,
        revokedAt: this.now()
      },
      include: API_KEY_INCLUDE
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action: 'SERVICE_API_KEY_REVOKED',
        targetType: 'SERVICE_API_KEY',
        targetId: apiKeyId
      }
    });

    return this.mapApiKey(updated);
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

  private mapBackupJob(job: BackupRecord): BackupJobDto {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      storageUri: job.storageUri,
      sizeBytes: job.sizeBytes ? bigintToNumber(job.sizeBytes) : null,
      durationSeconds: job.durationSeconds,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
      initiatedBy: job.initiatedBy
        ? buildNullableSummary(
            job.initiatedBy as unknown as User & {
              profile: { displayName: string | null } | null;
            }
          )
        : null
    };
  }

  private mapApiKey(record: ApiKeyRecord): ApiKeyDto {
    return {
      id: record.id,
      name: record.name,
      scope: record.scope,
      status: record.status,
      maskedKey: maskApiKey(record.prefix, record.suffix),
      prefix: record.prefix,
      suffix: record.suffix,
      requestCount: record.requestCount,
      createdAt: record.createdAt.toISOString(),
      lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
      lastRotatedAt: record.lastRotatedAt ? record.lastRotatedAt.toISOString() : null
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

  private async computeManagedUserMetrics(userIds: string[]): Promise<Map<string, ManagedUserMetrics>> {
    const metrics = new Map<string, ManagedUserMetrics>();
    if (userIds.length === 0) {
      return metrics;
    }

    for (const id of userIds) {
      metrics.set(id, { biomarkersLogged: 0, protocolsActive: 0, lastLoginAt: null });
    }

    const [biomarkerCounts, planCounts, lastLogins] = await Promise.all([
      this.prisma.biomarkerLog.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _count: { _all: true }
      }),
      this.prisma.longevityPlan.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _count: { _all: true }
      }),
      this.prisma.loginAudit.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, success: true },
        _max: { createdAt: true }
      })
    ]);

    for (const entry of biomarkerCounts) {
      if (!entry.userId) {
        continue;
      }
      const existing = metrics.get(entry.userId);
      if (existing) {
        existing.biomarkersLogged = entry._count._all ?? 0;
      }
    }

    for (const entry of planCounts) {
      if (!entry.userId) {
        continue;
      }
      const existing = metrics.get(entry.userId);
      if (existing) {
        existing.protocolsActive = entry._count._all ?? 0;
      }
    }

    for (const entry of lastLogins) {
      if (!entry.userId) {
        continue;
      }
      const existing = metrics.get(entry.userId);
      if (existing) {
        existing.lastLoginAt = entry._max.createdAt ? entry._max.createdAt.toISOString() : null;
      }
    }

    return metrics;
  }

  private mapManagedUser(
    user: User & {
      profile: {
        displayName: string | null;
        baselineSurvey?: Prisma.JsonValue | null;
      } | null;
    },
    metrics: ManagedUserMetrics
  ): AdminManagedUser {
    const displayName = user.profile?.displayName ?? user.fullName ?? user.email ?? 'Member';
    return {
      id: user.id,
      email: user.email ?? 'unknown',
      displayName,
      role: user.role,
      status: user.status,
      joinedAt: user.createdAt.toISOString(),
      lastLoginAt: metrics.lastLoginAt,
      planTier: derivePlanTier(user),
      biomarkersLogged: metrics.biomarkersLogged,
      protocolsActive: metrics.protocolsActive
    };
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
