import request from 'supertest';
import { Role, UserStatus } from '@prisma/client';

import { app } from '../app';
import { tokenService } from '../modules/identity/token-service';
import { insightsService } from '../modules/insights/insight.service';

jest.mock('../modules/insights/insight.service', () => {
  return {
    insightsService: {
      requestGeneration: jest.fn()
    }
  };
});

const issueToken = (status: UserStatus) =>
  tokenService.issueAccessToken({
    id: 'user-insights',
    email: 'member@example.com',
    role: Role.MEMBER,
    status
  }).token;

describe('Insights generation routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication to request generation', async () => {
    const response = await request(app).post('/insights/generate').send({});

    expect(response.status).toBe(401);
  });

  it('blocks members who have not completed onboarding', async () => {
    const token = issueToken(UserStatus.PENDING_ONBOARDING);

    const response = await request(app)
      .post('/insights/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: 'ONBOARDING_REQUIRED'
      }
    });
  });

  it('validates payloads and returns 422 on invalid input', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    const response = await request(app)
      .post('/insights/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ biomarkerWindowDays: 40 });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR'
      }
    });
    expect(insightsService.requestGeneration).not.toHaveBeenCalled();
  });

  it('enqueues an insight generation job and returns job metadata', async () => {
    const token = issueToken(UserStatus.ACTIVE);
    const job = {
      id: 'job-123',
      status: 'QUEUED',
      insightId: null,
      requestedById: 'user-insights',
      queue: 'insights-generate',
      cloudTaskName: 'insights-generate-user-insights-123456',
      payload: {
        request: { focus: 'sleep', biomarkerWindowDays: 7, includeManualLogs: true },
        models: [
          { id: 'primary', model: 'anthropic' },
          { id: 'fallback', model: 'openai' }
        ],
        attempts: []
      },
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      dispatchedAt: null,
      completedAt: null,
      scheduledAt: null,
      errorCode: null,
      errorMessage: null
    };
    (insightsService.requestGeneration as jest.Mock).mockResolvedValue(job);

    const response = await request(app)
      .post('/insights/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ focus: 'sleep', biomarkerWindowDays: 7, includeManualLogs: true });

    expect(response.status).toBe(202);
    expect(insightsService.requestGeneration).toHaveBeenCalledWith('user-insights', {
      focus: 'sleep',
      biomarkerWindowDays: 7,
      includeManualLogs: true,
      retryOf: undefined
    });
    expect(response.body).toMatchObject({
      id: 'job-123',
      status: 'QUEUED',
      queue: 'insights-generate'
    });
  });
});
