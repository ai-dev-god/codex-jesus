import {
  AdminBackupStatus,
  AdminBackupType,
  FlagStatus,
  FlagTargetType,
  Prisma,
  Role,
  ServiceApiKeyScope,
  ServiceApiKeyStatus,
  UserStatus,
  type PrismaClient
} from '@prisma/client';

import { AdminService } from '../modules/admin/admin.service';
import { HttpError } from '../modules/observability-ops/http-error';

type MockPrisma = {
  flag: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  adminAuditLog: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
  profile: {
    create: jest.Mock;
    update: jest.Mock;
  };
  authProvider: {
    create: jest.Mock;
  };
  biomarkerLog: {
    groupBy: jest.Mock;
  };
  longevityPlan: {
    groupBy: jest.Mock;
  };
  loginAudit: {
    groupBy: jest.Mock;
  };
  serviceApiKey: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  adminBackupJob: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  cloudTaskMetadata: {
    findMany: jest.Mock;
  };
  whoopIntegration: {
    findMany: jest.Mock;
  };
  insightGenerationJob: {
    findMany: jest.Mock;
  };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

const createMockPrisma = (): MockPrisma => {
  const mock: MockPrisma = {
    flag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    adminAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn()
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn()
    },
    profile: {
      create: jest.fn(),
      update: jest.fn()
    },
    authProvider: {
      create: jest.fn()
    },
    biomarkerLog: {
      groupBy: jest.fn()
    },
    longevityPlan: {
      groupBy: jest.fn()
    },
    loginAudit: {
      groupBy: jest.fn()
    },
    serviceApiKey: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    adminBackupJob: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn()
    },
    cloudTaskMetadata: {
      findMany: jest.fn()
    },
    whoopIntegration: {
      findMany: jest.fn()
    },
    insightGenerationJob: {
      findMany: jest.fn()
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn()
  };

  mock.$transaction.mockImplementation(async (callback: (tx: MockPrisma) => Promise<unknown>) => {
    return callback({
      ...mock,
      $transaction: mock.$transaction
    });
  });

  return mock;
};

const baseTimestamp = new Date('2025-02-01T12:00:00.000Z');

const createUser = (overrides: Partial<{
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName: string;
}> = {}) => {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'member@example.com',
    role: overrides.role ?? Role.MEMBER,
    status: overrides.status ?? UserStatus.ACTIVE,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    profile: overrides.displayName
      ? {
          id: 'profile-' + (overrides.id ?? 'user-1'),
          userId: overrides.id ?? 'user-1',
          displayName: overrides.displayName,
          timezone: 'UTC',
          baselineSurvey: null,
          consents: null,
          onboardingCompletedAt: baseTimestamp,
          deleteRequested: false,
          deletedAt: null,
          createdAt: baseTimestamp,
          updatedAt: baseTimestamp
        }
      : null
  };
};

const createMissingBackupTableError = () =>
  new Prisma.PrismaClientKnownRequestError('AdminBackupJob table is missing', {
    code: 'P2021',
    clientVersion: Prisma.prismaVersion.client,
    meta: {
      table: 'AdminBackupJob'
    }
  });

const createMissingApiKeyTableError = () =>
  new Prisma.PrismaClientKnownRequestError('ServiceApiKey table is missing', {
    code: 'P2021',
    clientVersion: Prisma.prismaVersion.client,
    meta: {
      table: 'ServiceApiKey'
    }
  });

const createFlagRecord = (overrides: Partial<Record<string, unknown>> = {}) => {
  const openedBy = createUser({ id: 'opened-1', email: 'opened@example.com', displayName: 'Opened User' });
  const resolvedBy = createUser({ id: 'mod-1', email: 'mod@example.com', displayName: 'Mod User', role: Role.MODERATOR });

  return {
    id: 'flag-1',
    targetType: FlagTargetType.COMMENT,
    status: FlagStatus.OPEN,
    reason: 'Inappropriate language',
    commentId: 'comment-1',
    comment: {
      id: 'comment-1',
      body: 'Flagged comment content',
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
      postId: 'post-99',
      post: {
        id: 'post-99',
        body: 'Parent post',
        createdAt: baseTimestamp,
        updatedAt: baseTimestamp
      },
      author: createUser({ id: 'author-1', email: 'author@example.com', displayName: 'Author User' })
    },
    openedBy,
    openedById: openedBy.id,
    resolvedBy,
    resolvedById: resolvedBy.id,
    resolvedAt: baseTimestamp,
    auditTrail: {
      events: [
        {
          status: 'OPEN',
          notes: 'Initial flag',
          actorId: openedBy.id,
          occurredAt: baseTimestamp.toISOString(),
          metadata: { source: 'member' }
        }
      ]
    },
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
};

describe('AdminService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists flags with pagination and sanitized summaries', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });

    const firstFlag = createFlagRecord();
    const secondFlag = createFlagRecord({
      id: 'flag-2',
      createdAt: new Date('2025-02-01T11:00:00.000Z'),
      comment: {
        ...(createFlagRecord().comment as Record<string, unknown>),
        id: 'comment-2',
        body: 'Second flag content'
      }
    });

    prisma.flag.findMany.mockResolvedValue([firstFlag, secondFlag]);

    const result = await service.listFlags({ status: FlagStatus.OPEN, limit: 1 });

    expect(prisma.flag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: FlagStatus.OPEN },
        take: 2,
        orderBy: { createdAt: 'desc' }
      })
    );

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      nextCursor: 'flag-2',
      hasMore: true
    });

    const [flag] = result.data;
    expect(flag).toMatchObject({
      id: 'flag-1',
      status: FlagStatus.OPEN,
      targetType: FlagTargetType.COMMENT,
      target: expect.objectContaining({
        type: 'COMMENT',
        id: 'comment-1',
        postId: 'post-99',
        author: expect.objectContaining({
          displayName: 'Author User'
        })
      }),
      openedBy: expect.objectContaining({
        id: 'opened-1',
        displayName: 'Opened User'
      })
    });
  });

  it('resolves flags and records an audit entry', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });

    const existing = createFlagRecord();
    const updated = {
      ...existing,
      status: FlagStatus.RESOLVED,
      resolvedAt: baseTimestamp,
      resolvedBy: createUser({
        id: 'mod-99',
        email: 'moderator@example.com',
        displayName: 'Moderator',
        role: Role.MODERATOR
      }),
      auditTrail: {
        events: [
          ...(existing.auditTrail as { events: unknown[] }).events,
          {
            status: FlagStatus.RESOLVED,
            notes: 'Reviewed and cleared',
            metadata: { action: 'resolve' },
            actorId: 'mod-99',
            occurredAt: baseTimestamp.toISOString()
          }
        ]
      }
    };

    prisma.flag.findUnique.mockResolvedValue(existing);
    prisma.flag.update.mockResolvedValue(updated);

    const result = await service.resolveFlag(
      createUser({ id: 'mod-99', email: 'moderator@example.com', role: Role.MODERATOR }),
      'flag-1',
      {
        status: FlagStatus.RESOLVED,
        resolutionNotes: 'Reviewed and cleared',
        metadata: { action: 'resolve' }
      }
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.flag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'flag-1' },
        data: expect.objectContaining({
          status: FlagStatus.RESOLVED,
          resolvedById: 'mod-99',
          auditTrail: expect.any(Object)
        })
      })
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FLAG_RESOLVED',
          targetType: 'FLAG',
          targetId: 'flag-1',
          metadata: expect.objectContaining({
            status: FlagStatus.RESOLVED,
            notes: 'Reviewed and cleared'
          })
        })
      })
    );

    expect(result).toMatchObject({
      id: 'flag-1',
      status: FlagStatus.RESOLVED,
      resolvedBy: expect.objectContaining({ id: 'mod-99' }),
      auditTrail: expect.objectContaining({
        events: expect.arrayContaining([
          expect.objectContaining({
            status: FlagStatus.RESOLVED,
            notes: 'Reviewed and cleared'
          })
        ])
      })
    });
  });

  it('triages flags without marking them resolved', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });

    const existing = createFlagRecord({
      status: FlagStatus.OPEN,
      resolvedBy: null,
      resolvedById: null,
      resolvedAt: null
    });

    prisma.flag.findUnique.mockResolvedValue(existing);
    prisma.flag.update.mockImplementation(async ({ data }) => ({
      ...existing,
      status: FlagStatus.TRIAGED,
      resolvedBy: null,
      resolvedById: null,
      resolvedAt: null,
      auditTrail: data.auditTrail
    }));

    const actor = createUser({ id: 'mod-77', role: Role.MODERATOR, email: 'mod77@example.com' });
    const result = await service.resolveFlag(actor, 'flag-1', {
      status: 'TRIAGED',
      resolutionNotes: 'Needs further review',
      metadata: { reason: 'escalate' }
    });

    expect(prisma.flag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'TRIAGED',
          resolvedById: null,
          resolvedAt: null
        })
      })
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FLAG_TRIAGED',
          metadata: expect.objectContaining({
            status: 'TRIAGED',
            previousStatus: FlagStatus.OPEN
          })
        })
      })
    );
    expect(result).toMatchObject({
      status: FlagStatus.TRIAGED,
      resolvedBy: null,
      resolvedAt: null
    });
  });

  it('prevents assigning unsupported roles', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient);

    prisma.user.findUnique.mockResolvedValue(createUser({ id: 'target-1', email: 'target@example.com' }));

    await expect(
      service.updateUserRole(
        createUser({ id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN }),
        'target-1',
        { role: Role.MEMBER }
      )
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('updates user roles and logs assignments', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });

    const admin = createUser({ id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN });
    const target = createUser({ id: 'target-1', email: 'target@example.com', role: Role.MEMBER, displayName: 'Target User' });
    const updated = { ...target, role: Role.MODERATOR };

    prisma.user.findUnique.mockResolvedValue(target);
    prisma.user.update.mockResolvedValue(updated);
    prisma.adminAuditLog.findMany.mockResolvedValue([]);

    const result = await service.updateUserRole(admin, 'target-1', { role: Role.MODERATOR });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-1' },
        data: { role: Role.MODERATOR }
      })
    );

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_ROLE_UPDATED',
          actorId: 'admin-1',
          targetId: 'target-1',
          metadata: expect.objectContaining({
            previousRole: Role.MEMBER,
            nextRole: Role.MODERATOR
          })
        })
      })
    );

    expect(result.user).toMatchObject({
      id: 'target-1',
      role: Role.MODERATOR,
      displayName: 'Target User'
    });
    expect(result.recentHistory).toHaveLength(0);
  });

  it('summarises system health metrics from queues, syncs, and AI retries', async () => {
    const prisma = createMockPrisma();
    const now = new Date('2025-02-01T12:00:00.000Z');
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => now
    });

    prisma.cloudTaskMetadata.findMany.mockResolvedValue([
      {
        id: 'task-1',
        queue: 'insights-generate',
        status: 'PENDING',
        scheduleTime: new Date('2025-02-01T11:45:00.000Z'),
        createdAt: new Date('2025-02-01T11:40:00.000Z'),
        firstAttemptAt: null
      },
      {
        id: 'task-2',
        queue: 'whoop-sync',
        status: 'DISPATCHED',
        scheduleTime: new Date('2025-02-01T11:30:00.000Z'),
        createdAt: new Date('2025-02-01T11:25:00.000Z'),
        firstAttemptAt: new Date('2025-02-01T11:31:00.000Z')
      }
    ]);

    prisma.whoopIntegration.findMany.mockResolvedValue([
      {
        id: 'integration-1',
        userId: 'user-1',
        syncStatus: 'PENDING',
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'integration-2',
        userId: 'user-2',
        syncStatus: 'ACTIVE',
        lastSyncedAt: new Date('2025-01-31T08:00:00.000Z'),
        createdAt: now,
        updatedAt: now
      }
    ]);

    prisma.insightGenerationJob.findMany.mockResolvedValue([
      {
        id: 'job-1',
        status: 'SUCCEEDED',
        createdAt: new Date('2025-02-01T10:30:00.000Z'),
        payload: {
          metrics: {
            retryCount: 1,
            failoverUsed: true
          }
        }
      },
      {
        id: 'job-2',
        status: 'FAILED',
        createdAt: new Date('2025-02-01T09:00:00.000Z'),
        payload: {
          metrics: {
            retryCount: 2,
            failoverUsed: true
          }
        }
      }
    ]);

    const summary = await service.getSystemHealthSummary();

    expect(prisma.cloudTaskMetadata.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: ['PENDING', 'DISPATCHED']
          }
        }
      })
    );

    expect(summary).toMatchObject({
      queues: expect.objectContaining({
        totalPending: 2,
        insights: expect.objectContaining({
          pending: 1
        }),
        whoop: expect.objectContaining({
          pending: 1
        })
      }),
      sync: expect.objectContaining({
        pendingConnections: 1,
        staleConnections: 2
      }),
      ai: expect.objectContaining({
        jobsLast24h: 2,
        failedJobsLast24h: 1,
        retriesLast24h: 3
      })
    });
  });

  it('creates managed users with onboarding defaults and audit entry', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });

    const admin = createUser({ id: 'admin-1', email: 'admin@example.com', role: Role.ADMIN });
    const hydratedUser = createUser({ id: 'new-user', email: 'new.member@example.com', displayName: 'New Member' });

    prisma.user.findUnique
      .mockResolvedValueOnce(null) // uniqueness check
      .mockResolvedValueOnce(hydratedUser); // hydration after create
    prisma.user.create.mockResolvedValue({ ...hydratedUser, profile: null });
    prisma.profile.create.mockResolvedValue({});
    prisma.authProvider.create.mockResolvedValue({});
    prisma.biomarkerLog.groupBy.mockResolvedValue([]);
    prisma.longevityPlan.groupBy.mockResolvedValue([]);
    prisma.loginAudit.groupBy.mockResolvedValue([]);
    prisma.adminAuditLog.create.mockResolvedValue({});

    const result = await service.createManagedUser(admin, {
      email: 'new.member@example.com',
      fullName: 'New Member',
      role: Role.MEMBER
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new.member@example.com',
          role: Role.MEMBER
        })
      })
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ADMIN_USER_CREATED',
          targetType: 'USER'
        })
      })
    );
    expect(result.user).toMatchObject({
      email: 'new.member@example.com',
      displayName: 'New Member',
      role: Role.MEMBER
    });
    expect(typeof result.temporaryPassword).toBe('string');
    expect(result.temporaryPassword.length).toBeGreaterThan(10);
  });

  it('returns database status aggregated from postgres stats', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient);

    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          datname: 'biohax',
          numbackends: 5,
          xact_commit: BigInt(120),
          xact_rollback: BigInt(3),
          blks_hit: BigInt(900),
          blks_read: BigInt(100),
          deadlocks: BigInt(1),
          stats_reset: new Date('2025-02-01T10:00:00.000Z'),
          size_bytes: BigInt(10_485_760)
        }
      ])
      .mockResolvedValueOnce([{ active_connections: BigInt(5) }])
      .mockResolvedValueOnce([{ max_connections: 50 }])
      .mockResolvedValueOnce([
        {
          name: 'User',
          row_estimate: BigInt(1000),
          total_bytes: BigInt(2_097_152),
          idx_scan: BigInt(500)
        }
      ]);

    const status = await service.getDatabaseStatus();

    expect(status.database).toMatchObject({
      name: 'biohax',
      activeConnections: 5,
      maxConnections: 50,
      sizeBytes: 10_485_760,
      transactionsCommitted: 120,
      transactionsRolledBack: 3,
      deadlocks: 1,
      cacheHitRatio: 0.9
    });
    expect(status.tables).toHaveLength(1);
    expect(status.tables[0]).toMatchObject({
      name: 'User',
      rowEstimate: 1000,
      sizeBytes: 2_097_152,
      indexScans: 500
    });
  });

  it('creates backup jobs and logs audit metadata', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });
    const admin = createUser({ id: 'admin-1', role: Role.ADMIN });

    prisma.$queryRaw.mockResolvedValueOnce([{ size_bytes: BigInt(1_000_000) }]);
    prisma.adminBackupJob.create.mockResolvedValue({
      id: 'job-1',
      type: AdminBackupType.FULL,
      status: AdminBackupStatus.SUCCEEDED,
      storageUri: 'gs://bucket/job-1.sql.gz',
      sizeBytes: BigInt(1_000_000),
      durationSeconds: 60,
      startedAt: baseTimestamp,
      completedAt: baseTimestamp,
      createdAt: baseTimestamp,
      initiatedBy: admin,
      metadata: null
    });
    prisma.adminAuditLog.create.mockResolvedValue({});

    const job = await service.triggerBackupJob(admin, AdminBackupType.FULL);

    expect(prisma.adminBackupJob.create).toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DATABASE_BACKUP_TRIGGERED',
          targetId: 'job-1'
        })
      })
    );
    expect(job).toMatchObject({
      id: 'job-1',
      status: AdminBackupStatus.SUCCEEDED,
      storageUri: 'gs://bucket/job-1.sql.gz'
    });
  });

  it('creates service API keys and returns plaintext value once', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });
    const admin = createUser({ id: 'admin-1', role: Role.ADMIN, displayName: 'Admin User' });

    prisma.serviceApiKey.create.mockResolvedValue({
      id: 'key-1',
      name: 'Production',
      prefix: 'bh_biohax',
      suffix: 'abcd',
      hashedSecret: 'hash',
      scope: ServiceApiKeyScope.READ,
      status: ServiceApiKeyStatus.ACTIVE,
      requestCount: 0,
      createdAt: baseTimestamp,
      lastUsedAt: null,
      lastRotatedAt: null,
      createdBy: admin,
      revokedBy: null,
      metadata: null
    });
    prisma.adminAuditLog.create.mockResolvedValue({});

    const result = await service.createApiKey(admin, { name: 'Production', scope: ServiceApiKeyScope.READ });

    expect(prisma.serviceApiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Production',
          scope: ServiceApiKeyScope.READ,
          createdById: 'admin-1'
        })
      })
    );
    expect(result.apiKey).toMatchObject({
      name: 'Production',
      scope: ServiceApiKeyScope.READ,
      status: ServiceApiKeyStatus.ACTIVE
    });
    expect(typeof result.plaintextKey).toBe('string');
    expect(result.plaintextKey.length).toBeGreaterThan(20);
  });

  it('returns an empty API key list when the table has not been provisioned', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient);

    prisma.serviceApiKey.findMany.mockRejectedValue(createMissingApiKeyTableError());

    const keys = await service.listApiKeys();

    expect(keys).toEqual({ data: [] });
  });

  it('surfaces a descriptive error when creating API keys before migrations run', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });
    const admin = createUser({ id: 'admin-1', role: Role.ADMIN, displayName: 'Admin User' });

    prisma.serviceApiKey.create.mockRejectedValue(createMissingApiKeyTableError());

    await expect(service.createApiKey(admin, { name: 'Production', scope: ServiceApiKeyScope.READ })).rejects.toMatchObject({
      status: 503,
      code: 'API_KEYS_NOT_READY'
    });
  });

  it('returns an empty backup list when the table has not been provisioned', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient);

    prisma.adminBackupJob.findMany.mockRejectedValue(createMissingBackupTableError());

    const jobs = await service.listBackupJobs();

    expect(jobs).toEqual({ data: [] });
  });

  it('surfaces a descriptive error when triggering backups before migrations run', async () => {
    const prisma = createMockPrisma();
    const service = new AdminService(prisma as unknown as PrismaClient, {
      now: () => baseTimestamp
    });
    const admin = createUser({ id: 'admin-1', role: Role.ADMIN, displayName: 'Admin User' });

    prisma.$queryRaw.mockResolvedValue([{ size_bytes: BigInt(1_000_000) }]);
    prisma.adminBackupJob.create.mockRejectedValue(createMissingBackupTableError());

    await expect(service.triggerBackupJob(admin, AdminBackupType.FULL)).rejects.toMatchObject({
      status: 503,
      code: 'BACKUPS_NOT_READY'
    });
  });
});
