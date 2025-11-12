import type { CloudTaskMetadata, PrismaClient } from '@prisma/client';

import { NotificationService } from '../modules/notifications/notification.service';
import { enqueueNotificationTask } from '../modules/notifications/notifications-queue';
import { HttpError } from '../modules/observability-ops/http-error';

jest.mock('../modules/notifications/notifications-queue', () => {
  const actual = jest.requireActual('../modules/notifications/notifications-queue');
  return {
    ...actual,
    enqueueNotificationTask: jest.fn()
  };
});

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
  };
  cloudTaskMetadata: {
    findMany: jest.Mock;
  };
};

const baseDate = new Date('2025-03-01T12:00:00.000Z');

const createMockPrisma = (): MockPrisma => ({
  user: {
    findUnique: jest.fn()
  },
  cloudTaskMetadata: {
    findMany: jest.fn()
  }
});

const createService = (prisma: MockPrisma) =>
  new NotificationService(prisma as unknown as PrismaClient, {
    now: () => baseDate,
    enqueue: enqueueNotificationTask as unknown as typeof enqueueNotificationTask
  });

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues insight alert notifications for active recipients', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'member-1',
      email: 'member@example.com',
      profile: {
        displayName: 'Jordan Peak'
      }
    });
    prisma.cloudTaskMetadata.findMany.mockResolvedValue([]);

    (enqueueNotificationTask as jest.Mock).mockResolvedValue({
      id: 'task-1',
      taskName: 'notifications-dispatch-member-1-123',
      queue: 'notifications-dispatch',
      status: 'PENDING'
    } satisfies Partial<CloudTaskMetadata>);

    const service = createService(prisma);
    const result = await service.scheduleInsightAlert('coach-1', {
      recipientId: 'member-1',
      insightId: 'insight-22',
      insightTitle: 'Recovery trending up',
      sendAt: baseDate
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      include: { profile: true }
    });
    expect(prisma.cloudTaskMetadata.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          queue: 'notifications-dispatch'
        })
      })
    );
    expect(enqueueNotificationTask).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: 'INSIGHT_ALERT',
        recipient: expect.objectContaining({
          id: 'member-1',
          email: 'member@example.com',
          displayName: 'Jordan Peak'
        }),
        data: expect.objectContaining({
          insightId: 'insight-22',
          insightTitle: 'Recovery trending up'
        })
      }),
      expect.objectContaining({
        scheduleTime: baseDate
      })
    );
    expect(result).toMatchObject({
      id: 'task-1',
      queue: 'notifications-dispatch'
    });
  });

  it('enforces rate limits per recipient and notification type', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'member-1',
      email: 'member@example.com',
      profile: {
        displayName: 'Jordan Peak'
      }
  });
  prisma.cloudTaskMetadata.findMany.mockResolvedValue([
    {
      id: 'task-1',
      queue: 'notifications-dispatch',
        payload: {
          payload: {
            type: 'INSIGHT_ALERT',
            recipient: {
              id: 'member-1'
            }
          }
        }
    },
    {
      id: 'task-2',
      queue: 'notifications-dispatch',
        payload: {
          payload: {
            type: 'INSIGHT_ALERT',
            recipient: {
              id: 'member-1'
            }
          }
      }
    },
    {
      id: 'task-3',
      queue: 'notifications-dispatch',
      payload: {
        payload: {
          type: 'INSIGHT_ALERT',
          recipient: {
            id: 'member-1'
          }
        }
      }
    },
    {
      id: 'task-3',
      queue: 'notifications-dispatch',
      payload: {
        payload: {
          type: 'STREAK_NUDGE',
            recipient: {
              id: 'other-member'
            }
          }
        }
      }
    ]);

    const service = createService(prisma);

    await expect(
      service.scheduleInsightAlert('coach-1', {
        recipientId: 'member-1',
        insightId: 'insight-33',
        insightTitle: 'Readiness dip detected'
      })
    ).rejects.toMatchObject({
      status: 429,
      code: 'NOTIFICATION_RATE_LIMITED'
    } satisfies Partial<HttpError>);
    expect(enqueueNotificationTask).not.toHaveBeenCalled();
  });

  it('throws when the recipient is not found', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(null);

    const service = createService(prisma);

    await expect(
      service.scheduleStreakNudge('coach-1', {
        recipientId: 'missing-user',
        streakType: 'INSIGHTS',
        currentStreak: 4
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOTIFICATION_RECIPIENT_NOT_FOUND'
    } satisfies Partial<HttpError>);
  });

  it('captures actor context for moderation notices', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'member-7',
      email: 'member7@example.com',
      profile: null
    });
    prisma.cloudTaskMetadata.findMany.mockResolvedValue([]);
    (enqueueNotificationTask as jest.Mock).mockResolvedValue({
      id: 'task-77',
      queue: 'notifications-dispatch',
      status: 'PENDING'
    } satisfies Partial<CloudTaskMetadata>);

    const service = createService(prisma);
    await service.scheduleModerationNotice('moderator-1', {
      recipientId: 'member-7',
      flagId: 'flag-88',
      status: 'RESOLVED',
      reason: 'Your comment was restored'
    });

    expect(enqueueNotificationTask).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: 'MODERATION_NOTICE',
        data: expect.objectContaining({
          flagId: 'flag-88',
          status: 'RESOLVED',
          triggeredBy: {
            id: 'moderator-1'
          }
        })
      }),
      expect.any(Object)
    );
  });
});
