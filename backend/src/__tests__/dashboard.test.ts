import request from 'supertest';
import { Role, UserStatus } from '@prisma/client';

import { app } from '../app';
import { tokenService } from '../modules/identity/token-service';
import { dashboardService } from '../modules/dashboard/dashboard.service';

jest.mock('../modules/dashboard/dashboard.service', () => {
  return {
    dashboardService: {
      getSummary: jest.fn(),
      getOfflineSnapshot: jest.fn()
    }
  };
});

const mockedDashboardService = dashboardService as jest.Mocked<typeof dashboardService>;

const issueAccessToken = (status: UserStatus) =>
  tokenService.issueAccessToken({
    id: 'user-dashboard',
    email: 'dashboard@example.com',
    role: Role.MEMBER,
    status
  }).token;

describe('Dashboard Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks pending users behind the onboarding gate', async () => {
    const token = issueAccessToken(UserStatus.PENDING_ONBOARDING);

    const response = await request(app).get('/dashboard').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: 'ONBOARDING_REQUIRED'
      }
    });
  });

  it('allows active users to access dashboard resources', async () => {
    const token = issueAccessToken(UserStatus.ACTIVE);
    mockedDashboardService.getSummary.mockResolvedValue({
      readinessScore: 78,
      strainScore: 45,
      sleepScore: null,
      latestWhoopSyncAt: '2025-01-03T00:00:00.000Z',
      todaysInsight: null,
      biomarkerTrends: [],
      actionItems: [
        {
          id: 'log-biomarker',
          title: 'Log your first biomarker',
          description: 'Capture a baseline HRV reading to unlock trends.',
          ctaType: 'LOG_BIOMARKER',
          testId: 'bh-dashboard-log-biomarker'
        }
      ],
      tiles: [
        {
          id: 'readiness',
          heading: 'Readiness',
          value: 78,
          delta: null,
          direction: 'UP',
          description: 'Readiness composite score',
          testId: 'bh-dashboard-readiness'
        }
      ],
      emptyStates: {
        needsBiomarkerLogs: true,
        needsInsight: true,
        needsWhoopLink: true
      },
      generatedAt: '2025-01-03T00:00:00.000Z',
      cacheState: 'MISS'
    });

    const response = await request(app).get('/dashboard').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mockedDashboardService.getSummary).toHaveBeenCalledWith('user-dashboard');
    expect(response.body).toMatchObject({
      readinessScore: 78,
      tiles: expect.any(Array),
      emptyStates: {
        needsBiomarkerLogs: true,
        needsInsight: true,
        needsWhoopLink: true
      },
      cacheState: 'MISS'
    });
  });

  it('exposes an offline snapshot for active users', async () => {
    const token = issueAccessToken(UserStatus.ACTIVE);
    mockedDashboardService.getOfflineSnapshot.mockResolvedValue({
      version: 1,
      generatedAt: '2025-01-03T00:00:00.000Z',
      expiresAt: '2025-01-03T00:15:00.000Z',
      summary: {
        readinessScore: 72,
        strainScore: 41,
        sleepScore: null,
        latestWhoopSyncAt: null,
        todaysInsight: null,
        biomarkerTrends: [],
        actionItems: [],
        tiles: [],
        emptyStates: {
          needsBiomarkerLogs: true,
          needsInsight: true,
          needsWhoopLink: true
        },
        generatedAt: '2025-01-03T00:00:00.000Z',
        cacheState: 'MISS'
      }
    });

    const response = await request(app)
      .get('/dashboard/offline')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mockedDashboardService.getOfflineSnapshot).toHaveBeenCalledWith('user-dashboard');
    expect(response.body).toMatchObject({
      version: 1,
      generatedAt: '2025-01-03T00:00:00.000Z',
      expiresAt: '2025-01-03T00:15:00.000Z'
    });
  });
});
