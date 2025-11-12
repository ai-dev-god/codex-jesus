import type { Prisma, PrismaClient } from '@prisma/client';

export const INSIGHTS_GENERATE_QUEUE = 'insights-generate';

export const INSIGHTS_GENERATE_RETRY_CONFIG = {
  maxAttempts: 5,
  minBackoffSeconds: 60,
  maxBackoffSeconds: 900
} as const;

export type InsightGenerationTaskPayload = {
  jobId: string;
  userId: string;
};

type EnqueueOptions = {
  taskName?: string;
  scheduleTime?: Date | null;
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type PrismaEnqueueClient = Pick<PrismaClient, 'cloudTaskMetadata'>;

export const enqueueInsightGenerationTask = async (
  prisma: PrismaEnqueueClient,
  payload: InsightGenerationTaskPayload,
  options: EnqueueOptions = {}
) => {
  const taskName = options.taskName ?? `insights-generate-${payload.userId}-${Date.now()}`;

  return prisma.cloudTaskMetadata.create({
    data: {
      taskName,
      queue: INSIGHTS_GENERATE_QUEUE,
      jobId: payload.jobId,
      payload: toJsonValue({
        payload,
        retry: INSIGHTS_GENERATE_RETRY_CONFIG
      }),
      scheduleTime: options.scheduleTime ?? null,
      status: 'PENDING'
    }
  });
};

export const insightsQueue = {
  queue: INSIGHTS_GENERATE_QUEUE,
  retryConfig: INSIGHTS_GENERATE_RETRY_CONFIG,
  enqueue: (prisma: PrismaClient, payload: InsightGenerationTaskPayload, options?: EnqueueOptions) =>
    enqueueInsightGenerationTask(prisma, payload, options)
};
