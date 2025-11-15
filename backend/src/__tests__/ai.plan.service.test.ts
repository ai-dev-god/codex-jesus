import type { PrismaClient } from '@prisma/client';

import { LongevityPlanService } from '../modules/ai/plan.service';
import { enqueueLongevityPlanTask } from '../modules/ai/queue';
import { HttpError } from '../modules/observability-ops/http-error';

jest.mock('../modules/ai/queue', () => ({
  enqueueLongevityPlanTask: jest.fn(),
  LONGEVITY_PLAN_QUEUE: 'longevity-plan-generate'
}));

type MockPrisma = {
  longevityPlanJob: {
    findFirst: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
  };
  longevityPlan: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

const createMockPrisma = (): MockPrisma => {
  const prisma: MockPrisma = {
    longevityPlanJob: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn()
    },
    longevityPlan: {
      create: jest.fn()
    },
    $transaction: jest.fn()
  };

  prisma.$transaction.mockImplementation(
    async (callback: (tx: MockPrisma) => Promise<unknown>) => callback(prisma)
  );

  return prisma;
};

const baseDate = new Date('2025-01-01T00:00:00.000Z');

const createService = (prisma: MockPrisma) =>
  new LongevityPlanService(prisma as unknown as PrismaClient, {
    now: () => baseDate
  });

describe('LongevityPlanService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (enqueueLongevityPlanTask as jest.Mock).mockResolvedValue({
      id: 'task-1',
      taskName: 'longevity-plan-user-1'
    });
  });

  it('prevents duplicate in-flight jobs per user', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.longevityPlanJob.findFirst.mockResolvedValue({
      id: 'job-1',
      status: 'RUNNING'
    });

    await expect(
      service.requestPlan('user-1', {
        focusAreas: ['lipids']
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'PLAN_JOB_IN_PROGRESS'
    } satisfies Partial<HttpError>);
  });

  it('enforces a per-day limit', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.longevityPlanJob.findFirst.mockResolvedValue(null);
    prisma.longevityPlanJob.count.mockResolvedValue(2);

    await expect(
      service.requestPlan('user-1', {
        goals: ['cardio endurance']
      })
    ).rejects.toMatchObject({
      status: 429,
      code: 'PLAN_RATE_LIMITED'
    } satisfies Partial<HttpError>);
  });

  it('creates a plan draft and enqueues a job', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.longevityPlanJob.findFirst.mockResolvedValue(null);
    prisma.longevityPlanJob.count.mockResolvedValue(0);
    prisma.longevityPlan.create.mockResolvedValue({
      id: 'plan-123',
      userId: 'user-1',
      status: 'PROCESSING',
      title: 'Longevity focus: lipids',
      summary: null,
      focusAreas: ['lipids'],
      sections: null,
      evidence: null,
      safetyState: null,
      requestedAt: baseDate,
      completedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
      validatedAt: null,
      validatedBy: null,
      errorCode: null,
      errorMessage: null
    });
    prisma.longevityPlanJob.create.mockResolvedValue({
      id: 'job-123',
      planId: 'plan-123',
      requestedById: 'user-1',
      status: 'QUEUED',
      queue: 'longevity-plan-generate',
      cloudTaskName: 'longevity-plan-user-1-123',
      payload: {},
      createdAt: baseDate,
      updatedAt: baseDate,
      dispatchedAt: null,
      scheduledAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      cloudTask: null
    });

    const result = await service.requestPlan('user-1', {
      focusAreas: ['lipids'],
      goals: ['reduce ApoB'],
      includeWearables: false
    });

    expect(prisma.longevityPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          focusAreas: ['lipids'],
          status: 'PROCESSING'
        })
      })
    );
    expect(prisma.longevityPlanJob.create).toHaveBeenCalled();
    expect(enqueueLongevityPlanTask).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        jobId: 'job-123',
        planId: 'plan-123',
        userId: 'user-1'
      }),
      expect.any(Object)
    );
    expect(result.plan.id).toBe('plan-123');
    expect(result.job.id).toBe('job-123');
  });
});

