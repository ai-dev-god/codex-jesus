import { apiFetch } from './http';

export type GymWorkoutSummary = {
  id: string;
  source: 'WHOOP';
  whoopWorkoutId: string;
  sport: string;
  category: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  strain: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  calories: number | null;
  energyKilojoule: number | null;
};

export type GymWeeklyPoint = {
  weekStart: string;
  avgStrain: number | null;
  workoutCount: number;
};

export type GymOverview = {
  linked: boolean;
  syncStatus: 'PENDING' | 'ACTIVE' | 'ERROR' | 'NOT_LINKED';
  lastSyncAt: string | null;
  workouts: GymWorkoutSummary[];
  metrics: {
    totalWorkouts7d: number;
    avgDurationMinutes7d: number | null;
    avgStrain7d: number | null;
    totalCalories7d: number | null;
  };
  sportDistribution: Array<{ sport: string; count: number }>;
  weeklyStrain: GymWeeklyPoint[];
};

type ListParams = {
  cursor?: string;
  take?: number;
};

export const getGymOverview = (accessToken: string): Promise<GymOverview> =>
  apiFetch<GymOverview>('/gym/overview', {
    method: 'GET',
    authToken: accessToken
  });

export const listGymWorkouts = (
  accessToken: string,
  params: ListParams = {}
): Promise<{ workouts: GymWorkoutSummary[]; nextCursor: string | null }> => {
  const search = new URLSearchParams();
  if (params.cursor) {
    search.set('cursor', params.cursor);
  }
  if (params.take) {
    search.set('take', String(params.take));
  }

  const query = search.toString();

  return apiFetch(`/gym/workouts${query ? `?${query}` : ''}`, {
    method: 'GET',
    authToken: accessToken
  });
};

export const syncGymWorkouts = (accessToken: string): Promise<{ enqueued: boolean }> =>
  apiFetch<{ enqueued: boolean }>('/gym/sync', {
    method: 'POST',
    authToken: accessToken
  });

