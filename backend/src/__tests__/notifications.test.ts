import request from 'supertest';
import { FlagStatus, Role, UserStatus, type CloudTaskMetadata } from '@prisma/client';

import { app } from '../app';
import { tokenService } from '../modules/identity/token-service';
import { notificationService } from '../modules/notifications/notification.service';

jest.mock('../modules/notifications/notification.service', () => ({
  notificationService: {
    scheduleInsightAlert: jest.fn(),
    scheduleStreakNudge: jest.fn(),
    scheduleModerationNotice: jest.fn()
  }
}));

const mockedNotificationService = notificationService as jest.Mocked<typeof notificationService>;

const issueToken = (role: Role, status: UserStatus = UserStatus.ACTIVE) =>
  tokenService.issueAccessToken({
    id: 'staff-1',
    email: 'staff@example.com',
    role,
    status
  }).token;

const createTask = (overrides: Partial<CloudTaskMetadata> = {}): CloudTaskMetadata => {
  const { planJobId, ...rest } = overrides;
  return {
    id: rest.id ?? 'task-1',
    taskName: rest.taskName ?? 'notifications-dispatch-member-1-123',
    queue: rest.queue ?? 'notifications-dispatch',
    status: rest.status ?? 'PENDING',
    jobId: rest.jobId ?? null,
    planJobId: planJobId ?? null,
    payload: rest.payload ?? null,
    scheduleTime: rest.scheduleTime ?? null,
    firstAttemptAt: rest.firstAttemptAt ?? null,
    lastAttemptAt: rest.lastAttemptAt ?? null,
    attemptCount: rest.attemptCount ?? 0,
    errorMessage: rest.errorMessage ?? null,
    createdAt: rest.createdAt ?? new Date('2025-03-01T12:00:00.000Z'),
    updatedAt: rest.updatedAt ?? new Date('2025-03-01T12:00:00.000Z')
  };
};

describe('Notifications Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication for insight notifications', async () => {
    const response = await request(app).post('/notifications/insight').send({});

    expect(response.status).toBe(401);
    expect(mockedNotificationService.scheduleInsightAlert).not.toHaveBeenCalled();
  });

  it('enforces staff roles for insight notifications', async () => {
    const memberToken = issueToken(Role.MEMBER);

    const response = await request(app)
      .post('/notifications/insight')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        recipientId: 'member-1',
        insightId: 'insight-22',
        insightTitle: 'Recovery trending up'
      });

    expect(response.status).toBe(403);
    expect(mockedNotificationService.scheduleInsightAlert).not.toHaveBeenCalled();
  });

  it('schedules insight notifications for coaches', async () => {
    const coachToken = issueToken(Role.COACH);
    mockedNotificationService.scheduleInsightAlert.mockResolvedValueOnce(
      createTask({ taskName: 'notifications-dispatch-member-1-123' })
    );

    const response = await request(app)
      .post('/notifications/insight')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        recipientId: 'member-1',
        insightId: 'insight-22',
        insightTitle: 'Recovery trending up',
        sendAt: '2025-03-02T08:00:00.000Z'
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      taskName: 'notifications-dispatch-member-1-123'
    });
    expect(mockedNotificationService.scheduleInsightAlert).toHaveBeenCalledWith('staff-1', {
      recipientId: 'member-1',
      insightId: 'insight-22',
      insightTitle: 'Recovery trending up',
      sendAt: new Date('2025-03-02T08:00:00.000Z')
    });
  });

  it('validates payload for streak nudges', async () => {
    const coachToken = issueToken(Role.COACH);

    const response = await request(app)
      .post('/notifications/streak')
      .set('Authorization', `Bearer ${coachToken}`)
      .send({
        recipientId: 'member-1',
        streakType: 'INSIGHTS'
      });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR'
      }
    });
    expect(mockedNotificationService.scheduleStreakNudge).not.toHaveBeenCalled();
  });

  it('schedules moderation notices for moderators', async () => {
    const moderatorToken = issueToken(Role.MODERATOR);
    mockedNotificationService.scheduleModerationNotice.mockResolvedValueOnce(
      createTask({ taskName: 'notifications-dispatch-member-9-555' })
    );

    const response = await request(app)
      .post('/notifications/moderation')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({
        recipientId: 'member-9',
        flagId: 'flag-55',
        status: FlagStatus.RESOLVED,
        reason: 'Post restored after review'
      });

    expect(response.status).toBe(202);
    expect(mockedNotificationService.scheduleModerationNotice).toHaveBeenCalledWith('staff-1', {
      recipientId: 'member-9',
      flagId: 'flag-55',
      status: FlagStatus.RESOLVED,
      reason: 'Post restored after review',
      sendAt: undefined
    });
  });
});
