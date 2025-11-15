import type { Prisma, PrismaClient } from '@prisma/client';

export const LONGEVITY_PLAN_QUEUE = 'longevity-plan-generate';

export const LONGEVITY_PLAN_RETRY_CONFIG = {
  maxAttempts: 5,
  minBackoffSeconds: 60,
  maxBackoffSeconds: 600
} as const;

export type LongevityPlanTaskPayload = {
  jobId: string;
  userId: string;
  planId: string;
};

type EnqueueOptions = {
  taskName?: string;
  scheduleTime?: Date | null;
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type PrismaEnqueueClient = Pick<PrismaClient, 'cloudTaskMetadata'>;

export const enqueueLongevityPlanTask = async (
  prisma: PrismaEnqueueClient,
  payload: LongevityPlanTaskPayload,
  options: EnqueueOptions = {}
) => {
  const taskName = options.taskName ?? `longevity-plan-${payload.userId}-${Date.now()}`;

  return prisma.cloudTaskMetadata.create({
    data: {
      taskName,
      queue: LONGEVITY_PLAN_QUEUE,
      planJobId: payload.jobId,
      payload: toJsonValue({
        payload,
        retry: LONGEVITY_PLAN_RETRY_CONFIG
      }),
      scheduleTime: options.scheduleTime ?? null,
      status: 'PENDING'
    }
  });
};

export const longevityPlanQueue = {
  queue: LONGEVITY_PLAN_QUEUE,
  retryConfig: LONGEVITY_PLAN_RETRY_CONFIG,
  enqueue: (prisma: PrismaClient, payload: LongevityPlanTaskPayload, options?: EnqueueOptions) =>
    enqueueLongevityPlanTask(prisma, payload, options)
};

