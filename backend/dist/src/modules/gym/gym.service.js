"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gymService = exports.GymService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const whoop_sync_dispatcher_1 = require("../wearable/whoop-sync-dispatcher");
const whoop_sport_map_1 = require("./whoop-sport-map");
const DAY_MS = 24 * 60 * 60 * 1000;
const toNumber = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    try {
        return value.toNumber();
    }
    catch {
        return null;
    }
};
const toMinutes = (seconds) => {
    if (!seconds || seconds <= 0) {
        return null;
    }
    return Math.round((seconds / 60) * 10) / 10;
};
const computeDistribution = (workouts) => {
    const buckets = new Map();
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
const computeWeeklyStrain = (workouts) => {
    const weekBuckets = new Map();
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
        avgStrain: entry.strains.length > 0 ? Math.round((entry.strains.reduce((acc, value) => acc + value, 0) / entry.strains.length) * 10) / 10 : null,
        workoutCount: entry.count
    }))
        .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())
        .slice(-8);
};
class GymService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getOverview(userId) {
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
    async listWorkouts(userId, params = {}) {
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
    async getWorkout(userId, workoutId) {
        const workout = await this.prisma.whoopWorkout.findUnique({
            where: { id: workoutId }
        });
        if (!workout || workout.userId !== userId) {
            throw new http_error_1.HttpError(404, 'Workout not found', 'WORKOUT_NOT_FOUND');
        }
        const summary = this.mapWorkout(workout);
        return {
            ...summary,
            timezoneOffsetMinutes: workout.timezoneOffsetMinutes ?? null,
            distanceMeters: workout.distanceMeters ?? null,
            rawPayload: workout.rawPayload
        };
    }
    async triggerSync(userId) {
        const integration = await this.prisma.whoopIntegration.findUnique({ where: { userId } });
        if (!integration) {
            throw new http_error_1.HttpError(409, 'No Whoop integration for this account', 'WHOOP_NOT_LINKED');
        }
        if (!integration.whoopUserId) {
            throw new http_error_1.HttpError(409, 'Whoop account is not fully linked yet.', 'WHOOP_PENDING_LINK');
        }
        await (0, whoop_sync_dispatcher_1.enqueueAndMaybeRunWhoopSync)(this.prisma, {
            userId,
            whoopUserId: integration.whoopUserId,
            reason: 'manual-retry'
        });
    }
    buildWeeklyMetrics(workouts) {
        if (workouts.length === 0) {
            return {
                totalWorkouts7d: 0,
                avgDurationMinutes7d: null,
                avgStrain7d: null,
                totalCalories7d: null
            };
        }
        const totalDuration = workouts.reduce((acc, workout) => acc + (workout.durationSeconds ?? 0), 0);
        const strains = workouts.map((workout) => toNumber(workout.strain)).filter((value) => typeof value === 'number');
        const calories = workouts.reduce((acc, workout) => acc + (workout.calories ?? 0), 0);
        return {
            totalWorkouts7d: workouts.length,
            avgDurationMinutes7d: totalDuration > 0 ? Math.round((totalDuration / workouts.length / 60) * 10) / 10 : null,
            avgStrain7d: strains.length > 0 ? Math.round((strains.reduce((acc, value) => acc + value, 0) / strains.length) * 10) / 10 : null,
            totalCalories7d: calories > 0 ? calories : null
        };
    }
    mapWorkout(workout) {
        const { name, category } = (0, whoop_sport_map_1.resolveWhoopSport)({
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
exports.GymService = GymService;
exports.gymService = new GymService(prisma_1.default);
