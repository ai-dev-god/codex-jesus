import type { PrismaClient } from '@prisma/client';

import { HttpError } from '../modules/observability-ops/http-error';
import { InsightGenerationService } from '../modules/insights/insight.service';
import { enqueueInsightGenerationTask } from '../modules/insights/insights-queue';

jest.mock('../modules/insights/insights-queue', () => ({
  enqueueInsightGenerationTask: jest.fn()
}));

type MockPrisma = {
  insightGenerationJob: {
    count: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

const baseDate = new Date('2025-01-01T00:00:00.000Z');

const createMockPrisma = (): MockPrisma => {
  const prisma: MockPrisma = {
    insightGenerationJob: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn()
    },
    $transaction: jest.fn()
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: MockPrisma) => Promise<unknown>) => callback(prisma));

  return prisma;
};

const createService = (prisma: MockPrisma) =>
  new InsightGenerationService(prisma as unknown as PrismaClient, {
    now: () => baseDate
  });

describe('InsightGenerationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (enqueueInsightGenerationTask as jest.Mock).mockResolvedValue({
      id: 'meta-1',
      taskName: 'insights-generate-user-1-123'
    });
  });

  it('throws when a job is already running for the user', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.insightGenerationJob.findFirst.mockResolvedValue({
      id: 'job-1',
      status: 'RUNNING'
    });

    await expect(
      service.requestGeneration('user-1', {
        focus: 'sleep',
        biomarkerWindowDays: 7,
        includeManualLogs: true
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'INSIGHT_JOB_IN_PROGRESS'
    } satisfies Partial<HttpError>);
  });

  it('enforces a daily request cap per member', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.insightGenerationJob.findFirst.mockResolvedValue(null);
    prisma.insightGenerationJob.count.mockResolvedValue(3);

    await expect(
      service.requestGeneration('user-1', {
        focus: 'readiness',
        biomarkerWindowDays: 7,
        includeManualLogs: true
      })
    ).rejects.toMatchObject({
      status: 429,
      code: 'INSIGHT_RATE_LIMITED'
    } satisfies Partial<HttpError>);
  });

  it('creates a job and queues a task with default parameters', async () => {
    const prisma = createMockPrisma();
    const service = createService(prisma);
    prisma.insightGenerationJob.findFirst.mockResolvedValue(null);
    prisma.insightGenerationJob.count.mockResolvedValue(0);
    prisma.insightGenerationJob.create.mockImplementation(async (args) => ({
      ...args.data,
      id: 'job-123',
      status: 'QUEUED',
      cloudTaskName: args.data.cloudTaskName ?? 'insights-generate-user-1-123',
      queue: 'insights-generate',
      requestedById: 'user-1',
      createdAt: baseDate,
      updatedAt: baseDate,
      scheduledAt: null,
      dispatchedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      insightId: null
    }));

    const job = await service.requestGeneration('user-1', {
      focus: 'sleep',
      biomarkerWindowDays: 10,
      includeManualLogs: false
    });

    expect(prisma.insightGenerationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedById: 'user-1',
          status: 'QUEUED',
          payload: expect.objectContaining({
            request: expect.objectContaining({
              biomarkerWindowDays: 10,
              includeManualLogs: false
            }),
            attempts: []
          })
        })
      })
    );
    expect(enqueueInsightGenerationTask).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        jobId: 'job-123',
        userId: 'user-1'
      }),
      expect.objectContaining({
        taskName: expect.stringContaining('insights-generate-user-1')
      })
    );
    expect(job).toMatchObject({
      id: 'job-123',
      status: 'QUEUED',
      requestedById: 'user-1'
    });
  });
});
