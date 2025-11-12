import type { CloudTaskMetadata, Insight, InsightGenerationJob, PrismaClient } from '@prisma/client';

import { createInsightsGenerateWorker, type OpenRouterChatClient } from '../workers/insights-generate';

jest.mock('../modules/dashboard/dashboard.service', () => ({
  dashboardService: {
    invalidateUser: jest.fn().mockResolvedValue(undefined)
  }
}));

type FindArgs = Record<string, unknown>;
type UpdateArgs<T> = { data?: Partial<T> };
type CreateArgs<T> = { data: Partial<T> };

type MockPrisma = {
  cloudTaskMetadata: {
    findUnique: jest.Mock<Promise<CloudTaskMetadata | null>, [FindArgs]>;
    update: jest.Mock<Promise<CloudTaskMetadata>, [UpdateArgs<CloudTaskMetadata>]>;
  };
  insightGenerationJob: {
    findUnique: jest.Mock<Promise<InsightGenerationJob | null>, [FindArgs]>;
    update: jest.Mock<Promise<InsightGenerationJob>, [UpdateArgs<InsightGenerationJob>]>;
  };
  insight: {
    create: jest.Mock<Promise<Insight>, [CreateArgs<Insight>]>;
  };
};

const baseTime = new Date('2025-01-01T00:00:00.000Z');

const createMetadata = (overrides: Partial<CloudTaskMetadata> = {}): CloudTaskMetadata => ({
  id: 'meta-1',
  taskName: 'insights-generate-user-insights-123',
  queue: 'insights-generate',
  status: 'PENDING',
  jobId: 'job-1',
  payload: {
    payload: {
      jobId: 'job-1',
      userId: 'user-1'
    },
    retry: {
      maxAttempts: 3,
      minBackoffSeconds: 60,
      maxBackoffSeconds: 600
    }
  },
  scheduleTime: null,
  firstAttemptAt: null,
  lastAttemptAt: null,
  attemptCount: 0,
  errorMessage: null,
  createdAt: baseTime,
  updatedAt: baseTime,
  ...overrides
});

const createJob = (overrides: Partial<InsightGenerationJob> = {}): InsightGenerationJob => ({
  id: 'job-1',
  status: 'QUEUED',
  insightId: null,
  requestedById: 'user-1',
  cloudTaskName: 'insights-generate-user-insights-123',
  queue: 'insights-generate',
  payload: {
    request: {
      focus: 'sleep',
      biomarkerWindowDays: 7,
      includeManualLogs: true,
      retryOf: null
    },
    models: [
      {
        id: 'primary',
        model: 'openrouter/anthropic/claude-3-haiku',
        temperature: 0.2,
        systemPrompt: 'system prompt primary'
      },
      {
        id: 'fallback',
        model: 'openrouter/openai/gpt-4o-mini',
        temperature: 0.1,
        systemPrompt: 'system prompt fallback'
      }
    ],
    attempts: []
  },
  scheduledAt: null,
  dispatchedAt: null,
  completedAt: null,
  errorCode: null,
  errorMessage: null,
  createdAt: baseTime,
  updatedAt: baseTime,
  ...overrides
});

const createInsight = (overrides: Partial<Insight> = {}): Insight => ({
  id: 'insight-1',
  userId: 'user-1',
  title: 'Better Sleep Recovery',
  summary: 'Summary text',
  body: { recommendations: [] },
  status: 'DRAFT',
  modelUsed: 'openrouter/openai/gpt-4o-mini',
  generatedAt: baseTime,
  promptMetadata: { focus: 'sleep' },
  createdAt: baseTime,
  updatedAt: baseTime,
  ...overrides
});

const createMockPrisma = (): MockPrisma => ({
  cloudTaskMetadata: {
    findUnique: jest.fn<Promise<CloudTaskMetadata | null>, [FindArgs]>(),
    update: jest.fn<Promise<CloudTaskMetadata>, [UpdateArgs<CloudTaskMetadata>]>()
  },
  insightGenerationJob: {
    findUnique: jest.fn<Promise<InsightGenerationJob | null>, [FindArgs]>(),
    update: jest.fn<Promise<InsightGenerationJob>, [UpdateArgs<InsightGenerationJob>]>()
  },
  insight: {
    create: jest.fn<Promise<Insight>, [CreateArgs<Insight>]>()
  }
});

describe('insights-generate worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks metadata as succeeded after generating an insight', async () => {
    const prisma = createMockPrisma();
    const metadata = createMetadata();
    const job = createJob();
    const createdInsight = createInsight({ id: 'insight-42' });
    prisma.cloudTaskMetadata.findUnique.mockResolvedValue(metadata);
    prisma.insightGenerationJob.findUnique.mockResolvedValue(job);
    prisma.insight.create.mockResolvedValue(createdInsight);
    prisma.cloudTaskMetadata.update.mockImplementation(async (args) => {
      const payload = args.data ?? {};
      return createMetadata({
        ...payload,
        status: 'SUCCEEDED',
        attemptCount: 1,
        firstAttemptAt: baseTime,
        lastAttemptAt: baseTime
      });
    });
    prisma.insightGenerationJob.update.mockImplementation(async (args) => {
      const payload = args.data ?? {};
      return {
        ...job,
        ...payload
      };
    });

    const openRouter: OpenRouterChatClient = {
      createChatCompletion: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'resp-1',
          model: 'openrouter/anthropic/claude-3-haiku',
          content: 'invalid json'
        })
        .mockResolvedValueOnce({
          id: 'resp-2',
          model: 'openrouter/openai/gpt-4o-mini',
          content: JSON.stringify({
            title: 'Sleep Recovery Focus',
            summary: 'Summary text',
            body: {
              recommendations: ['Wind down routine', 'Limit late caffeine']
            }
          })
        })
    };

    const worker = createInsightsGenerateWorker({
      prisma: prisma as unknown as PrismaClient,
      openRouter,
      now: () => baseTime,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    });

    await worker('insights-generate-user-insights-123');

    expect(openRouter.createChatCompletion).toHaveBeenCalledTimes(2);
    expect(prisma.insight.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          title: 'Sleep Recovery Focus',
          summary: 'Summary text',
          modelUsed: 'openrouter/openai/gpt-4o-mini'
        })
      })
    );
    expect(prisma.cloudTaskMetadata.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: metadata.id },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: baseTime,
          lastAttemptAt: baseTime
        })
      })
    );
    const updateCalls = prisma.insightGenerationJob.update.mock.calls;
    expect(updateCalls[0][0]).toMatchObject({
      where: { id: job.id },
      data: { status: 'RUNNING', dispatchedAt: baseTime }
    });
    expect(updateCalls.some(([args]) => args.data?.status === 'SUCCEEDED')).toBe(true);
    const hasAttemptsRecord = updateCalls.some(([args]) => {
      const payload = args.data?.payload as { attempts?: unknown[] } | undefined;
      return Array.isArray(payload?.attempts);
    });
    expect(hasAttemptsRecord).toBe(true);
    const successCall = updateCalls.find(([args]) => args.data?.status === 'SUCCEEDED');
    expect(successCall).toBeDefined();
    const [successArgs] = successCall!;
    const successPayload = successArgs.data?.payload as {
      metrics?: { retryCount?: number; failoverUsed?: boolean };
    } | null;
    expect(successPayload).toEqual(
      expect.objectContaining({
        metrics: expect.objectContaining({
          retryCount: 0,
          failoverUsed: true
        })
      })
    );
  });

  it('marks job as failed when all models fail', async () => {
    const prisma = createMockPrisma();
    const metadata = createMetadata();
    const job = createJob();
    prisma.cloudTaskMetadata.findUnique.mockResolvedValue(metadata);
    prisma.insightGenerationJob.findUnique.mockResolvedValue(job);
    prisma.insightGenerationJob.update.mockImplementation(async (args) => {
      const payload = args.data ?? {};
      return {
        ...job,
        ...payload
      };
    });

    const openRouter: OpenRouterChatClient = {
      createChatCompletion: jest
        .fn()
        .mockRejectedValue(new Error('upstream failure'))
    };

    const worker = createInsightsGenerateWorker({
      prisma: prisma as unknown as PrismaClient,
      openRouter,
      now: () => baseTime,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    });

    await worker('insights-generate-user-insights-123');

    expect(prisma.insight.create).not.toHaveBeenCalled();
    expect(prisma.insightGenerationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: job.id },
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'INSIGHT_PROVIDER_FAILURE'
        })
      })
    );
    expect(prisma.cloudTaskMetadata.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: metadata.id },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('All insight models failed')
        })
      })
    );
    const failureCall = prisma.insightGenerationJob.update.mock.calls.at(-1);
    expect(failureCall).toBeDefined();
    const [failureArgs] = failureCall!;
    const failurePayload = failureArgs.data?.payload as {
      metrics?: { retryCount?: number; failoverUsed?: boolean };
    } | null;
    expect(failurePayload).toEqual(
      expect.objectContaining({
        metrics: expect.objectContaining({
          retryCount: 1,
          failoverUsed: true
        })
      })
    );
  });

  it('skips processing when metadata is missing', async () => {
    const prisma = createMockPrisma();
    prisma.cloudTaskMetadata.findUnique.mockResolvedValue(null);

    const worker = createInsightsGenerateWorker({
      prisma: prisma as unknown as PrismaClient,
      openRouter: {
        createChatCompletion: jest.fn()
      },
      now: () => baseTime,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    });

    await worker('unknown-task');

    expect(prisma.insightGenerationJob.findUnique).not.toHaveBeenCalled();
  });
});
