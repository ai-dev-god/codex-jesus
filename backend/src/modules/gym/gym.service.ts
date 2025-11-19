import type { Prisma, PrismaClient, WhoopSyncStatus, WhoopWorkout } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import { enqueueAndMaybeRunWhoopSync } from '../wearable/whoop-sync-dispatcher';
import { resolveWhoopSport } from './whoop-sport-map';

const DAY_MS = 24 * 60 * 60 * 1000;

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

export type GymWorkoutDetail = GymWorkoutSummary & {
  timezoneOffsetMinutes: number | null;
  distanceMeters: number | null;
  rawPayload: Record<string, unknown> | null;
};

export type GymOverview = {
  linked: boolean;
  syncStatus: WhoopSyncStatus | 'NOT_LINKED';
  lastSyncAt: string | null;
  workouts: GymWorkoutSummary[];
  metrics: {
    totalWorkouts7d: number;
    avgDurationMinutes7d: number | null;
    avgStrain7d: number | null;
    totalCalories7d: number | null;
  };
  sportDistribution: Array<{ sport: string; count: number }>;
  weeklyStrain: Array<{ weekStart: string; avgStrain: number | null; workoutCount: number }>;
};

type ListParams = {
  cursor?: string | null;
  take?: number;
};

const toNumber = (value: Prisma.Decimal | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  try {
    return (value as Prisma.Decimal).toNumber();
  } catch {
    return null;
  }
};

const toMinutes = (seconds: number | null | undefined): number | null => {
  if (!seconds || seconds <= 0) {
    return null;
  }

  return Math.round((seconds / 60) * 10) / 10;
};

const computeDistribution = (workouts: WhoopWorkout[]): Array<{ sport: string; count: number }> => {
  const buckets = new Map<string, number>();
  workouts.forEach((workout) => {
    const sport = workout.sport ?? 'Workout';
    const current = buckets.get(sport) ?? 0;
    buckets.set(sport, current + 1);
  });

  return Array.from(buckets.entries())
    .map(([sport, count]) => ({ sport, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
};

const computeWeeklyStrain = (workouts: WhoopWorkout[]): Array<{ weekStart: string; avgStrain: number | null; workoutCount: number }> => {
  const weekBuckets = new Map<string, { strains: number[]; count: number }>();

  workouts.forEach((workout) => {
    const date = workout.startTime;
    const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - date.getUTCDay()));
    const key = weekStart.toISOString();
    const entry = weekBuckets.get(key) ?? { strains: [], count: 0 };
    const strain = toNumber(workout.strain);
    if (typeof strain === 'number') {
      entry.strains.push(strain);
    }
    entry.count += 1;
    weekBuckets.set(key, entry);
  });

  return Array.from(weekBuckets.entries())
    .map(([weekStart, entry]) => ({
      weekStart,
      avgStrain:
        entry.strains.length > 0 ? Math.round((entry.strains.reduce((acc, value) => acc + value, 0) / entry.strains.length) * 10) / 10 : null,
      workoutCount: entry.count
    }))
    .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())
    .slice(-8);
};

export class GymService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOverview(userId: string): Promise<GymOverview> {
    const now = Date.now();
    const weekStart = new Date(now - 7 * DAY_MS);
    const lookbackStart = new Date(now - 56 * DAY_MS);

    const [integration, recentWorkouts, lookbackWorkouts, weeklyWorkouts] = await Promise.all([
      this.prisma.whoopIntegration.findUnique({ where: { userId } }),
      this.prisma.whoopWorkout.findMany({
        where: { userId },
        orderBy: { startTime: 'desc' },
        take: 20
      }),
      this.prisma.whoopWorkout.findMany({
        where: {
          userId,
          startTime: {
            gte: lookbackStart
          }
        },
        orderBy: { startTime: 'asc' }
      }),
      this.prisma.whoopWorkout.findMany({
        where: {
          userId,
          startTime: {
            gte: weekStart
          }
        }
      })
    ]);

    const linked = Boolean(integration && integration.syncStatus === 'ACTIVE' && integration.accessToken);
    const metrics = this.buildWeeklyMetrics(weeklyWorkouts);
    const sportDistribution = computeDistribution(lookbackWorkouts);
    const weeklyStrain = computeWeeklyStrain(lookbackWorkouts);

    return {
      linked,
      syncStatus: integration?.syncStatus ?? 'NOT_LINKED',
      lastSyncAt: integration?.lastSyncedAt ? integration.lastSyncedAt.toISOString() : null,
      workouts: recentWorkouts.map((workout) => this.mapWorkout(workout)),
      metrics,
      sportDistribution,
      weeklyStrain
    };
  }

  async listWorkouts(userId: string, params: ListParams = {}): Promise<{ workouts: GymWorkoutSummary[]; nextCursor: string | null }> {
    const take = Math.min(Math.max(params.take ?? 25, 1), 100);

    const workouts = await this.prisma.whoopWorkout.findMany({
      where: { userId },
      orderBy: { startTime: 'desc' },
      take,
      ...(params.cursor
        ? {
            skip: 1,
            cursor: { id: params.cursor }
          }
        : {})
    });

    const nextCursor = workouts.length === take ? workouts[workouts.length - 1].id : null;

    return {
      workouts: workouts.map((workout) => this.mapWorkout(workout)),
      nextCursor
    };
  }

  async getWorkout(userId: string, workoutId: string): Promise<GymWorkoutDetail> {
    const workout = await this.prisma.whoopWorkout.findUnique({
      where: { id: workoutId }
    });

    if (!workout || workout.userId !== userId) {
      throw new HttpError(404, 'Workout not found', 'WORKOUT_NOT_FOUND');
    }

    const summary = this.mapWorkout(workout);

    return {
      ...summary,
      timezoneOffsetMinutes: workout.timezoneOffsetMinutes ?? null,
      distanceMeters: workout.distanceMeters ?? null,
      rawPayload: workout.rawPayload as Record<string, unknown> | null
    };
  }

  async triggerSync(userId: string): Promise<void> {
    const integration = await this.prisma.whoopIntegration.findUnique({ where: { userId } });
    if (!integration) {
      throw new HttpError(409, 'No Whoop integration for this account', 'WHOOP_NOT_LINKED');
    }

    if (!integration.whoopUserId) {
      throw new HttpError(409, 'Whoop account is not fully linked yet.', 'WHOOP_PENDING_LINK');
    }

    await enqueueAndMaybeRunWhoopSync(this.prisma, {
      userId,
      whoopUserId: integration.whoopUserId,
      reason: 'manual-retry'
    });
  }

  private buildWeeklyMetrics(workouts: WhoopWorkout[]): GymOverview['metrics'] {
    if (workouts.length === 0) {
      return {
        totalWorkouts7d: 0,
        avgDurationMinutes7d: null,
        avgStrain7d: null,
        totalCalories7d: null
      };
    }

    const totalDuration = workouts.reduce((acc, workout) => acc + (workout.durationSeconds ?? 0), 0);
    const strains = workouts.map((workout) => toNumber(workout.strain)).filter((value): value is number => typeof value === 'number');
    const calories = workouts.reduce((acc, workout) => acc + (workout.calories ?? 0), 0);

    return {
      totalWorkouts7d: workouts.length,
      avgDurationMinutes7d: totalDuration > 0 ? Math.round((totalDuration / workouts.length / 60) * 10) / 10 : null,
      avgStrain7d: strains.length > 0 ? Math.round((strains.reduce((acc, value) => acc + value, 0) / strains.length) * 10) / 10 : null,
      totalCalories7d: calories > 0 ? calories : null
    };
  }

  private mapWorkout(workout: WhoopWorkout): GymWorkoutSummary {
    const { name, category } = resolveWhoopSport({
      sportName: workout.sport ?? undefined,
      sportTypeId: workout.sportTypeId ?? undefined
    });

    return {
      id: workout.id,
      source: 'WHOOP',
      whoopWorkoutId: workout.whoopWorkoutId,
      sport: name,
      category,
      startTime: workout.startTime.toISOString(),
      endTime: workout.endTime ? workout.endTime.toISOString() : null,
      durationMinutes: toMinutes(workout.durationSeconds ?? null),
      strain: toNumber(workout.strain),
      avgHeartRate: workout.avgHeartRate ?? null,
      maxHeartRate: workout.maxHeartRate ?? null,
      calories: workout.calories ?? null,
      energyKilojoule: workout.energyKilojoule ?? null
    };
  }
}

export const gymService = new GymService(prismaClient);

