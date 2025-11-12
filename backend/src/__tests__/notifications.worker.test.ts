import type { CloudTaskMetadata, PrismaClient } from '@prisma/client';

import { createNotificationWorker } from '../workers/notify';
import { NOTIFICATIONS_RETRY_CONFIG } from '../modules/notifications/notifications-queue';

jest.mock('../modules/observability-ops/alerting', () => ({
  alerting: {
    notify: jest.fn().mockResolvedValue(undefined)
  }
}));

const { alerting } = jest.requireMock('../modules/observability-ops/alerting') as {
  alerting: {
    notify: jest.Mock;
  };
};

type MockPrisma = {
  cloudTaskMetadata: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const baseDate = new Date('2025-03-01T12:30:00.000Z');

const createMetadata = (overrides: Partial<CloudTaskMetadata> = {}): CloudTaskMetadata => ({
  id: 'meta-1',
  taskName: 'notifications-dispatch-member-1-123',
  queue: 'notifications-dispatch',
  status: 'PENDING',
  jobId: null,
  payload: {
    payload: {
      type: 'INSIGHT_ALERT',
      recipient: {
        id: 'member-1',
        email: 'member@example.com',
        displayName: 'Jordan Peak'
      },
      data: {
        insightId: 'insight-22',
        insightTitle: 'Recovery trending up',
        triggeredBy: {
          id: 'coach-1'
        },
        triggeredAt: '2025-03-01T12:30:00.000Z'
      },
      channel: 'email'
    },
    retry: NOTIFICATIONS_RETRY_CONFIG
  },
  scheduleTime: null,
  firstAttemptAt: null,
  lastAttemptAt: null,
  attemptCount: 0,
  errorMessage: null,
  createdAt: baseDate,
  updatedAt: baseDate,
  ...overrides
});

const createMockPrisma = (): MockPrisma => ({
  cloudTaskMetadata: {
    findUnique: jest.fn(),
    update: jest.fn()
  }
});

describe('notification worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delivers notifications via Resend and marks metadata as succeeded', async () => {
    const prisma = createMockPrisma();
    const metadata = createMetadata();
    prisma.cloudTaskMetadata.findUnique.mockResolvedValue(metadata);
    prisma.cloudTaskMetadata.update.mockImplementation(async (args) => ({
      ...metadata,
      ...args.data
    }));

    const resend = {
      mode: 'live' as const,
      sendEmail: jest.fn().mockResolvedValue({ id: 'email-1' })
    };

    const worker = createNotificationWorker({
      prisma: prisma as unknown as PrismaClient,
      resend,
      now: () => baseDate
    });

    await worker('notifications-dispatch-member-1-123');

    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.com',
        subject: expect.stringMatching('Recovery'),
        html: expect.stringContaining('Recovery trending up')
      })
    );
    expect(prisma.cloudTaskMetadata.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: metadata.id },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          attemptCount: metadata.attemptCount + 1,
          firstAttemptAt: baseDate,
          lastAttemptAt: baseDate,
          errorMessage: null
        })
      })
    );
  });

  it('raises alerting hooks when attempts are exhausted', async () => {
    const prisma = createMockPrisma();
    const metadata = createMetadata({
      attemptCount: NOTIFICATIONS_RETRY_CONFIG.maxAttempts - 1
    });
    prisma.cloudTaskMetadata.findUnique.mockResolvedValue(metadata);
    prisma.cloudTaskMetadata.update.mockImplementation(async (args) => ({
      ...metadata,
      ...args.data
    }));

    const resend = {
      mode: 'live' as const,
      sendEmail: jest.fn().mockRejectedValue(new Error('Resend unavailable'))
    };

    const worker = createNotificationWorker({
      prisma: prisma as unknown as PrismaClient,
      resend,
      now: () => baseDate,
      alerting
    });

    await worker('notifications-dispatch-member-1-123');

    expect(prisma.cloudTaskMetadata.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          attemptCount: NOTIFICATIONS_RETRY_CONFIG.maxAttempts,
          errorMessage: 'Resend unavailable'
        })
      })
    );
    expect(alerting.notify).toHaveBeenCalledWith(
      'notifications.dead_letter',
      expect.objectContaining({
        taskName: metadata.taskName,
        type: 'INSIGHT_ALERT',
        error: 'Resend unavailable'
      })
    );
  });

  it('logs and returns when metadata is missing', async () => {
    const prisma = createMockPrisma();
    prisma.cloudTaskMetadata.findUnique.mockResolvedValue(null);

    const resend = {
      mode: 'live' as const,
      sendEmail: jest.fn()
    };

    const worker = createNotificationWorker({
      prisma: prisma as unknown as PrismaClient,
      resend,
      now: () => baseDate
    });

    await worker('missing-task');

    expect(resend.sendEmail).not.toHaveBeenCalled();
    expect(prisma.cloudTaskMetadata.update).not.toHaveBeenCalled();
  });
});
