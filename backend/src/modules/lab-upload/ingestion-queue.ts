import type { Prisma, PrismaClient } from '@prisma/client';

export const LAB_UPLOAD_QUEUE = 'lab-upload-ingest';

export const LAB_UPLOAD_RETRY_CONFIG = {
  maxAttempts: 5,
  minBackoffSeconds: 45,
  maxBackoffSeconds: 600
} as const;

export type LabUploadIngestionPayload = {
  uploadId: string;
  userId: string;
};

type EnqueueOptions = {
  taskName?: string;
  scheduleTime?: Date | null;
};

const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type PrismaEnqueueClient = Pick<PrismaClient, 'cloudTaskMetadata'>;

export const enqueueLabUploadIngestionTask = async (
  prisma: PrismaEnqueueClient,
  payload: LabUploadIngestionPayload,
  options: EnqueueOptions = {}
) => {
  const taskName = options.taskName ?? `lab-upload-${payload.uploadId}-${Date.now()}`;

  return prisma.cloudTaskMetadata.create({
    data: {
      taskName,
      queue: LAB_UPLOAD_QUEUE,
      payload: toJsonValue({
        payload,
        retry: LAB_UPLOAD_RETRY_CONFIG
      }),
      scheduleTime: options.scheduleTime ?? null,
      status: 'PENDING'
    }
  });
};

export const labUploadQueue = {
  queue: LAB_UPLOAD_QUEUE,
  retryConfig: LAB_UPLOAD_RETRY_CONFIG,
  enqueue: (prisma: PrismaClient, payload: LabUploadIngestionPayload, options?: EnqueueOptions) =>
    enqueueLabUploadIngestionTask(prisma, payload, options)
};

