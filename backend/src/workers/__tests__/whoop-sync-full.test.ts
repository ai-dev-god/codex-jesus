
import { jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { createWhoopSyncWorker } from '../whoop-sync';
import { WhoopApiClient } from '../../modules/wearable/whoop-api.client';
import { WhoopTokenManager } from '../../modules/wearable/whoop-token-manager';

// Mock dependencies
const mockPrisma = {
  cloudTaskMetadata: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  whoopIntegration: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  whoopWorkout: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  whoopCycle: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  whoopSleep: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  whoopRecovery: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
} as unknown as PrismaClient;

const mockApiClient = {
  listWorkouts: jest.fn(),
  listCycles: jest.fn(),
  listSleep: jest.fn(),
  listRecovery: jest.fn(),
} as unknown as WhoopApiClient;

const mockTokenManager = {
  ensureAccessToken: jest.fn(),
} as unknown as WhoopTokenManager;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('whoopSyncWorker', () => {
  const worker = createWhoopSyncWorker({
    prisma: mockPrisma,
    apiClient: mockApiClient,
    tokenManager: mockTokenManager,
    logger: mockLogger,
    now: () => new Date('2024-01-01T12:00:00Z'),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute full sync successfully', async () => {
    const taskName = 'test-task';
    const userId = 'user-1';
    const whoopUserId = 'whoop-1';

    // Mock Metadata
    (mockPrisma.cloudTaskMetadata.findUnique as jest.Mock).mockResolvedValue({
      id: 'meta-1',
      taskName,
      payload: {
        payload: { userId, whoopUserId, reason: 'scheduled' },
      },
      attemptCount: 0,
    } as any);

    // Mock Integration
    (mockPrisma.whoopIntegration.findUnique as jest.Mock).mockResolvedValue({
      id: 'int-1',
      userId,
      whoopUserId,
      syncStatus: 'ACTIVE',
    } as any);

    // Mock Token
    (mockTokenManager.ensureAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'valid-token',
    } as any);

    // Mock Data Responses
    (mockApiClient.listCycles as jest.Mock).mockResolvedValue({
      records: [{
        id: 101,
        user_id: 1001,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T23:59:59Z',
        timezone_offset: 0,
        score_state: 'SCORED',
        score: { strain: 10.5, kilojoule: 2000, average_heart_rate: 60, max_heart_rate: 120 }
      }],
      nextCursor: null
    } as any);

    (mockApiClient.listWorkouts as jest.Mock).mockResolvedValue({
      records: [{
        id: 201,
        user_id: 1001,
        start: '2024-01-01T10:00:00Z',
        end: '2024-01-01T11:00:00Z',
        timezone_offset: 0,
        sport_id: 1,
        score_state: 'SCORED',
        score: { strain: 8.0, kilocalories: 500 }
      }],
      nextCursor: null
    } as any);

    (mockApiClient.listSleep as jest.Mock).mockResolvedValue({
      records: [{
        id: 301,
        user_id: 1001,
        start: '2023-12-31T22:00:00Z',
        end: '2024-01-01T06:00:00Z',
        timezone_offset: 0,
        nap: false,
        score_state: 'SCORED',
        score: {
          stage_summary: {
            total_in_bed_time_milli: 28800000,
            total_awake_time_milli: 3600000,
            total_no_data_time_milli: 0,
            total_light_sleep_time_milli: 10000000,
            total_slow_wave_sleep_time_milli: 5000000,
            total_rem_sleep_time_milli: 5000000,
            sleep_cycle_count: 4,
            disturbance_count: 2
          },
          sleep_performance_percentage: 90,
          sleep_consistency_percentage: 80,
          sleep_efficiency_percentage: 95,
          respiratory_rate: 14.5,
          sleep_needed: {
             baseline_milli: 28000000,
             need_from_sleep_debt_milli: 0,
             need_from_recent_strain_milli: 0,
             need_from_recent_nap_milli: 0
          }
        }
      }],
      nextCursor: null
    } as any);

    (mockApiClient.listRecovery as jest.Mock).mockResolvedValue({
      records: [{
        cycle_id: 101,
        sleep_id: 301,
        user_id: 1001,
        created_at: '2024-01-01T06:00:00Z',
        updated_at: '2024-01-01T06:00:00Z',
        score_state: 'SCORED',
        score: {
          recovery_score: 85,
          resting_heart_rate: 55,
          hrv_rmssd_milli: 45,
          spo2_percentage: 98,
          skin_temp_celsius: 36.5,
          user_calibrating: false
        }
      }],
      nextCursor: null
    } as any);

    await worker(taskName);

    // Assertions
    expect(mockApiClient.listCycles).toHaveBeenCalled();
    expect(mockApiClient.listWorkouts).toHaveBeenCalled();
    expect(mockApiClient.listSleep).toHaveBeenCalled();
    expect(mockApiClient.listRecovery).toHaveBeenCalled();

    // Using 'any' to access dynamic delegates in mock
    expect((mockPrisma as any).whoopCycle.upsert).toHaveBeenCalled();
    expect((mockPrisma as any).whoopWorkout.upsert).toHaveBeenCalled();
    expect((mockPrisma as any).whoopSleep.upsert).toHaveBeenCalled();
    expect((mockPrisma as any).whoopRecovery.upsert).toHaveBeenCalled();

    expect(mockPrisma.cloudTaskMetadata.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'meta-1' } }),
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCEEDED' }) })
    );
  });

  it('should handle missing token', async () => {
    const taskName = 'test-task-no-token';
    const userId = 'user-1';

     (mockPrisma.cloudTaskMetadata.findUnique as jest.Mock).mockResolvedValue({
      id: 'meta-2',
      taskName,
      payload: {
        payload: { userId, whoopUserId: 'w1', reason: 'scheduled' },
      },
      attemptCount: 0,
    } as any);

    (mockPrisma.whoopIntegration.findUnique as jest.Mock).mockResolvedValue({
      id: 'int-1',
      userId,
    } as any);

    (mockTokenManager.ensureAccessToken as jest.Mock).mockResolvedValue({
      accessToken: null,
    } as any);

    await expect(worker(taskName)).rejects.toThrow('Missing Whoop access token');

    expect(mockPrisma.whoopIntegration.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'int-1' } }),
        expect.objectContaining({ data: { syncStatus: 'PENDING' } })
    );

    expect(mockPrisma.cloudTaskMetadata.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'meta-2' } }),
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });
});
