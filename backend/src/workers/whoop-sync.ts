import { Prisma } from '@prisma/client';
import type { PrismaClient, WhoopIntegration } from '@prisma/client';

import prismaClient from '../lib/prisma';
import {
  WHOOP_SYNC_QUEUE,
  WHOOP_SYNC_RETRY_CONFIG,
  type WhoopSyncTaskPayload
} from '../modules/wearable/whoop-sync-queue';
import {
  WhoopApiClient,
  type WhoopWorkoutRecord,
  type WhoopCycleRecord,
  type WhoopRecoveryRecord,
  type WhoopSleepRecord,
  type WhoopBodyMeasurementRecord
} from '../modules/wearable/whoop-api.client';
import { WhoopTokenManager } from '../modules/wearable/whoop-token-manager';
import { whoopTokenCrypto } from '../modules/wearable/token-crypto';
import { resolveWhoopSport } from '../modules/gym/whoop-sport-map';

type WhoopSyncWorkerDeps = {
  prisma?: PrismaClient;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  now?: () => Date;
  apiClient?: WhoopApiClient;
  tokenManager?: WhoopTokenManager;
};

const LOOKBACK_DAYS = Number(process.env.WHOOP_SYNC_LOOKBACK_DAYS ?? 90);
const BUFFER_HOURS = Number(process.env.WHOOP_SYNC_BUFFER_HOURS ?? 6);
const PAGE_LIMIT = Number(process.env.WHOOP_SYNC_PAGE_LIMIT ?? 50);

const resolvePayload = (metadataPayload: unknown): WhoopSyncTaskPayload | null => {
  if (!metadataPayload || typeof metadataPayload !== 'object') {
    return null;
  }

  const payload = (metadataPayload as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const userId = typeof record.userId === 'string' ? record.userId : null;
  const whoopUserId = typeof record.whoopUserId === 'string' ? record.whoopUserId : null;
  const reason = record.reason;

  if (
    !userId ||
    !whoopUserId ||
    (reason !== 'initial-link' && reason !== 'scheduled' && reason !== 'manual-retry' && reason !== 'webhook')
  ) {
    return null;
  }

  return {
    userId,
    whoopUserId,
    reason
  };
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toInt = (value: unknown): number | null => {
  const num = toNumber(value);
  if (num === null) {
    return null;
  }
  return Math.round(num);
};

const toDecimalWithPrecision = (value: unknown, fractionDigits = 2): Prisma.Decimal | null => {
  const num = toNumber(value);
  if (num === null) {
    return null;
  }
  const digits = Number.isFinite(fractionDigits) ? Math.max(0, fractionDigits) : 2;
  return new Prisma.Decimal(num.toFixed(digits));
};

const toDecimal = (value: unknown): Prisma.Decimal | null => toDecimalWithPrecision(value, 2);

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const computeDurationSeconds = (start: Date | null, end: Date | null): number | null => {
  if (!start || !end) {
    return null;
  }
  const diff = Math.round((end.getTime() - start.getTime()) / 1000);
  return diff > 0 ? diff : null;
};

const resolveStartTime = async (
  prisma: PrismaClient,
  userId: string,
  model: 'whoopWorkout' | 'whoopCycle' | 'whoopRecovery' | 'whoopSleep',
  now: Date
): Promise<Date> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastRecord = await (prisma[model] as any).findFirst({
    where: { userId },
    // For recovery, we use createdAt as a proxy if startTime doesn't exist, but Recovery usually has created_at or we use cycle timestamp.
    // Our schema has startTime for Cycle, Sleep, Workout. Recovery has createdAt.
    orderBy: model === 'whoopRecovery' ? { createdAt: 'desc' } : { startTime: 'desc' }
  });

  if (!lastRecord) {
    return new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  }

  const bufferMs = BUFFER_HOURS * 60 * 60 * 1000;
  const time = model === 'whoopRecovery' ? lastRecord.createdAt : lastRecord.startTime;
  return new Date(time.getTime() - bufferMs);
};

const upsertWorkout = async (
  prisma: PrismaClient,
  userId: string,
  whoopUserId: string,
  record: WhoopWorkoutRecord
): Promise<void> => {
  const startTime = parseDate(record.start);
  const endTime = parseDate(record.end);
  if (!startTime) {
    return;
  }

  const durationSeconds = computeDurationSeconds(startTime, endTime);
  const { name, category } = resolveWhoopSport({
    sportName: typeof record.sport_name === 'string' ? record.sport_name : undefined,
    sportTypeId: record.sport_type_id ?? record.sport_id
  });
  const score = record.score ?? {};
  const calories = toInt(score.kilocalories) ?? (score.kilojoule ? Math.round(score.kilojoule / 4.184) : null);
  const distanceMeters = toInt(score.distance_meter);
  const energyKilojoule = toInt(score.kilojoule);
  const whoopWorkoutId = String(record.id);

  await prisma.whoopWorkout.upsert({
    where: { whoopWorkoutId },
    update: {
      userId,
      whoopUserId,
      sport: name,
      sportCategory: category,
      sportTypeId: record.sport_type_id ?? record.sport_id ?? null,
      scoreState: record.score_state ?? null,
      intensityLevel: record.intensity_level ?? null,
      startTime,
      endTime,
      durationSeconds,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      strain: toDecimal(score.strain),
      avgHeartRate: toInt(score.average_heart_rate),
      maxHeartRate: toInt(score.max_heart_rate),
      calories,
      distanceMeters,
      energyKilojoule,
      rawPayload: record as Prisma.InputJsonValue
    },
    create: {
      userId,
      whoopUserId,
      whoopWorkoutId,
      sport: name,
      sportCategory: category,
      sportTypeId: record.sport_type_id ?? record.sport_id ?? null,
      scoreState: record.score_state ?? null,
      intensityLevel: record.intensity_level ?? null,
      startTime,
      endTime,
      durationSeconds,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      strain: toDecimal(score.strain),
      avgHeartRate: toInt(score.average_heart_rate),
      maxHeartRate: toInt(score.max_heart_rate),
      calories,
      distanceMeters,
      energyKilojoule,
      rawPayload: record as Prisma.InputJsonValue
    }
  });
};

const upsertCycle = async (
  prisma: PrismaClient,
  userId: string,
  whoopUserId: string,
  record: WhoopCycleRecord
): Promise<void> => {
  const startTime = parseDate(record.start);
  const endTime = parseDate(record.end);
  if (!startTime) {
    return;
  }

  const score = record.score ?? {};
  const whoopCycleId = String(record.id);

  await prisma.whoopCycle.upsert({
    where: { whoopCycleId },
    update: {
      userId,
      whoopUserId,
      startTime,
      endTime,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      scoreState: record.score_state ?? null,
      strain: toDecimal(score.strain),
      kilojoule: toDecimal(score.kilojoule),
      avgHeartRate: toInt(score.average_heart_rate),
      maxHeartRate: toInt(score.max_heart_rate),
      rawPayload: record as Prisma.InputJsonValue
    },
    create: {
      userId,
      whoopUserId,
      whoopCycleId,
      startTime,
      endTime,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      scoreState: record.score_state ?? null,
      strain: toDecimal(score.strain),
      kilojoule: toDecimal(score.kilojoule),
      avgHeartRate: toInt(score.average_heart_rate),
      maxHeartRate: toInt(score.max_heart_rate),
      rawPayload: record as Prisma.InputJsonValue
    }
  });
};

const upsertRecovery = async (
  prisma: PrismaClient,
  userId: string,
  whoopUserId: string,
  record: WhoopRecoveryRecord
): Promise<void> => {
  const cycleId = record.cycle_id ? String(record.cycle_id) : null;
  const sleepId = record.sleep_id ? String(record.sleep_id) : null;
  const score = record.score ?? {};
  
  // Using the unique ID from Whoop record
  const whoopRecoveryId = String(record.id); 

  await prisma.whoopRecovery.upsert({
    where: { whoopRecoveryId },
    update: {
      userId,
      whoopUserId,
      cycleId,
      sleepId,
      scoreState: record.score_state ?? null,
      score: toInt(score.recovery_score),
      restingHeartRate: toInt(score.resting_heart_rate),
      hrvRmssdMilli: toDecimal(score.hrv_rmssd_milli),
      spo2Percentage: toDecimal(score.spo2_percentage),
      skinTempCelsius: toDecimal(score.skin_temp_celsius),
      userCalibrating: score.user_calibrating ?? false,
      rawPayload: record as Prisma.InputJsonValue
    },
    create: {
      userId,
      whoopUserId,
      whoopRecoveryId,
      cycleId,
      sleepId,
      scoreState: record.score_state ?? null,
      score: toInt(score.recovery_score),
      restingHeartRate: toInt(score.resting_heart_rate),
      hrvRmssdMilli: toDecimal(score.hrv_rmssd_milli),
      spo2Percentage: toDecimal(score.spo2_percentage),
      skinTempCelsius: toDecimal(score.skin_temp_celsius),
      userCalibrating: score.user_calibrating ?? false,
      rawPayload: record as Prisma.InputJsonValue
    }
  });
};

const upsertSleep = async (
  prisma: PrismaClient,
  userId: string,
  whoopUserId: string,
  record: WhoopSleepRecord
): Promise<void> => {
  const startTime = parseDate(record.start);
  const endTime = parseDate(record.end);
  if (!startTime) {
    return;
  }

  const whoopSleepId = String(record.id);
  const cycleId = record.cycle_id ? String(record.cycle_id) : null;
  const score = record.score ?? {};
  const summary = score.stage_summary ?? {};
  const needed = score.sleep_needed ?? {};
  const performanceScore = toInt(score.sleep_performance_percentage);
  const consistencyScore = toInt(score.sleep_consistency_percentage);
  const efficiencyScore = toInt(score.sleep_efficiency_percentage);
  const totalInBedSeconds = summary.total_in_bed_time_milli ? Math.round(summary.total_in_bed_time_milli / 1000) : null;
  const totalAwakeSeconds = summary.total_awake_time_milli ? Math.round(summary.total_awake_time_milli / 1000) : null;
  const totalLightSleepSeconds = summary.total_light_sleep_time_milli
    ? Math.round(summary.total_light_sleep_time_milli / 1000)
    : null;
  const totalSlowWaveSleepSeconds = summary.total_slow_wave_sleep_time_milli
    ? Math.round(summary.total_slow_wave_sleep_time_milli / 1000)
    : null;
  const totalRemSleepSeconds = summary.total_rem_sleep_time_milli
    ? Math.round(summary.total_rem_sleep_time_milli / 1000)
    : null;
  const sleepNeedMillis =
    (needed.baseline_milli ?? 0) +
    (needed.need_from_sleep_debt_milli ?? 0) +
    (needed.need_from_recent_strain_milli ?? 0) +
    (needed.need_from_recent_nap_milli ?? 0);
  const sleepNeedSeconds = sleepNeedMillis > 0 ? Math.round(sleepNeedMillis / 1000) : null;

  await prisma.whoopSleep.upsert({
    where: { whoopSleepId },
    update: {
      userId,
      whoopUserId,
      cycleId,
      startTime,
      endTime,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      nap: record.nap ?? false,
      scoreState: record.score_state ?? null,
      score: performanceScore,
      performance: performanceScore,
      consistency: consistencyScore,
      efficiency: efficiencyScore,
      respiratoryRate: toDecimal(score.respiratory_rate),
      totalInBedSeconds,
      totalAwakeSeconds,
      totalLightSleepSeconds,
      totalSlowWaveSleepSeconds,
      totalRemSleepSeconds,
      sleepCycleCount: toInt(summary.sleep_cycle_count),
      disturbanceCount: toInt(summary.disturbance_count),
      sleepNeedSeconds,
      rawPayload: record as Prisma.InputJsonValue
    },
    create: {
      userId,
      whoopUserId,
      whoopSleepId,
      cycleId,
      startTime,
      endTime,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      nap: record.nap ?? false,
      scoreState: record.score_state ?? null,
      score: performanceScore,
      performance: performanceScore,
      consistency: consistencyScore,
      efficiency: efficiencyScore,
      respiratoryRate: toDecimal(score.respiratory_rate),
      totalInBedSeconds,
      totalAwakeSeconds,
      totalLightSleepSeconds,
      totalSlowWaveSleepSeconds,
      totalRemSleepSeconds,
      sleepCycleCount: toInt(summary.sleep_cycle_count),
      disturbanceCount: toInt(summary.disturbance_count),
      sleepNeedSeconds,
      rawPayload: record as Prisma.InputJsonValue
    }
  });
};

const upsertBodyMeasurement = async (
  prisma: PrismaClient,
  userId: string,
  whoopUserId: string,
  record: WhoopBodyMeasurementRecord
): Promise<void> => {
  const capturedAt = parseDate(record.captured_at ?? record.updated_at ?? record.created_at) ?? new Date();
  const heightMeter = toDecimalWithPrecision(record.height_meter, 3);
  const weightKg = toDecimalWithPrecision(record.weight_kg, 3);
  const rawPayload = record as Prisma.InputJsonValue;

  await prisma.whoopBodyMeasurement.upsert({
    where: {
      userId_capturedAt: {
        userId,
        capturedAt
      }
    },
    update: {
      whoopUserId,
      heightMeter,
      weightKg,
      maxHeartRate: toInt(record.max_heart_rate),
      rawPayload,
      capturedAt
    },
    create: {
      userId,
      whoopUserId,
      heightMeter,
      weightKg,
      maxHeartRate: toInt(record.max_heart_rate),
      rawPayload,
      capturedAt
    }
  });
};

const updateTaskStatus = async (
  prisma: PrismaClient,
  metadataId: string,
  status: 'SUCCEEDED' | 'FAILED',
  attemptCount: number,
  timestamps: { firstAttemptAt: Date | null; now: Date },
  errorMessage?: string | null
) => {
  await prisma.cloudTaskMetadata.update({
    where: { id: metadataId },
    data: {
      status,
      attemptCount: attemptCount + 1,
      firstAttemptAt: timestamps.firstAttemptAt ?? timestamps.now,
      lastAttemptAt: timestamps.now,
      errorMessage: errorMessage ?? null
    }
  });
};

const runSync = async (
  prisma: PrismaClient,
  tokenManager: WhoopTokenManager,
  apiClient: WhoopApiClient,
  integration: WhoopIntegration,
  payload: WhoopSyncTaskPayload,
  logger: Pick<Console, 'info' | 'warn' | 'error'>,
  now: Date
): Promise<{ fetched: number; upserted: number }> => {
  const { accessToken } = await tokenManager.ensureAccessToken(integration);
  if (!accessToken) {
    await prisma.whoopIntegration.update({
      where: { id: integration.id },
      data: { syncStatus: 'PENDING' }
    });
    throw new Error(`Missing Whoop access token for user ${integration.userId}`);
  }

  let fetched = 0;
  let upserted = 0;

  // Sync Cycles
  try {
    const startTime = await resolveStartTime(prisma, payload.userId, 'whoopCycle', now);
    let cursor: string | null = null;
    do {
      const response = await apiClient.listCycles(accessToken, { start: startTime, cursor, limit: PAGE_LIMIT });
      fetched += response.records.length;
      for (const record of response.records) {
        try {
          await upsertCycle(prisma, payload.userId, payload.whoopUserId, record);
          upserted += 1;
        } catch (e) {
          logger.warn?.('[whoop-sync] Failed to persist cycle', { error: String(e) });
        }
      }
      cursor = response.nextCursor;
    } while (cursor);
  } catch (e) {
    logger.error?.('[whoop-sync] Cycle sync failed', { error: String(e) });
  }

  // Sync Recoveries
  try {
    const startTime = await resolveStartTime(prisma, payload.userId, 'whoopRecovery', now);
    let cursor: string | null = null;
    do {
      const response = await apiClient.listRecoveries(accessToken, { start: startTime, cursor, limit: PAGE_LIMIT });
      fetched += response.records.length;
      for (const record of response.records) {
        try {
          await upsertRecovery(prisma, payload.userId, payload.whoopUserId, record);
          upserted += 1;
        } catch (e) {
          logger.warn?.('[whoop-sync] Failed to persist recovery', { error: String(e) });
        }
      }
      cursor = response.nextCursor;
    } while (cursor);
  } catch (e) {
    logger.error?.('[whoop-sync] Recovery sync failed', { error: String(e) });
  }

  // Sync Sleeps
  try {
    const startTime = await resolveStartTime(prisma, payload.userId, 'whoopSleep', now);
    let cursor: string | null = null;
    do {
      const response = await apiClient.listSleeps(accessToken, { start: startTime, cursor, limit: PAGE_LIMIT });
      fetched += response.records.length;
      for (const record of response.records) {
        try {
          await upsertSleep(prisma, payload.userId, payload.whoopUserId, record);
          upserted += 1;
        } catch (e) {
          logger.warn?.('[whoop-sync] Failed to persist sleep', { error: String(e) });
        }
      }
      cursor = response.nextCursor;
    } while (cursor);
  } catch (e) {
    logger.error?.('[whoop-sync] Sleep sync failed', { error: String(e) });
  }

  // Sync Workouts
  try {
    const startTime = await resolveStartTime(prisma, payload.userId, 'whoopWorkout', now);
    let cursor: string | null = null;
    do {
      const response = await apiClient.listWorkouts(accessToken, {
        start: startTime,
        cursor,
        limit: PAGE_LIMIT
      });
      fetched += response.records.length;

      for (const record of response.records) {
        try {
          await upsertWorkout(prisma, payload.userId, payload.whoopUserId, record);
          upserted += 1;
        } catch (error) {
          logger.warn?.('[whoop-sync] Failed to persist workout', {
            userId: payload.userId,
            whoopWorkoutId: record.id,
            error: error instanceof Error ? error.message : error
          });
        }
      }

      cursor = response.nextCursor;
    } while (cursor);
  } catch (e) {
     logger.error?.('[whoop-sync] Workout sync failed', { error: String(e) });
  }

  // Sync Body Measurements (Snapshot)
  try {
    const bodyMeasurements = await apiClient.getBodyMeasurements(accessToken);
    if (bodyMeasurements) {
      fetched += 1;
      await upsertBodyMeasurement(prisma, payload.userId, payload.whoopUserId, bodyMeasurements);
      upserted += 1;
    }
  } catch (error) {
    logger.warn?.('[whoop-sync] Failed to sync body measurements', { userId: payload.userId, error });
  }

  await prisma.whoopIntegration.update({
    where: { id: integration.id },
    data: {
      lastSyncedAt: now,
      syncStatus: 'ACTIVE',
      updatedAt: now
    }
  });

  return { fetched, upserted };
};

export const createWhoopSyncWorker = (deps: WhoopSyncWorkerDeps = {}) => {
  const prisma = deps.prisma ?? prismaClient;
  const logger = deps.logger ?? console;
  const nowFactory = deps.now ?? (() => new Date());
  const apiClient = deps.apiClient ?? new WhoopApiClient();
  const tokenManager =
    deps.tokenManager ??
    new WhoopTokenManager(
      prisma,
      whoopTokenCrypto,
      () => new Date()
    );

  return async (taskName: string): Promise<void> => {
    const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
    if (!metadata) {
      logger.warn?.(`[whoop-sync] No task metadata found for task ${taskName}`);
      return;
    }

    const payload = resolvePayload(metadata.payload);
    if (!payload) {
      logger.warn?.('[whoop-sync] Invalid task payload', { taskName });
      await updateTaskStatus(prisma, metadata.id, 'FAILED', metadata.attemptCount, { firstAttemptAt: metadata.firstAttemptAt, now: nowFactory() }, 'Invalid whoop sync payload');
      return;
    }

    const integration = await prisma.whoopIntegration.findUnique({ where: { userId: payload.userId } });
    if (!integration) {
      logger.warn?.('[whoop-sync] No integration found for user', { userId: payload.userId });
      await updateTaskStatus(prisma, metadata.id, 'FAILED', metadata.attemptCount, { firstAttemptAt: metadata.firstAttemptAt, now: nowFactory() }, 'Integration not found');
      return;
    }

    const now = nowFactory();
    logger.info?.('[whoop-sync] Dispatching wearable sync', {
      taskName,
      queue: WHOOP_SYNC_QUEUE,
      retry: WHOOP_SYNC_RETRY_CONFIG,
      payload
    });

    try {
      const result = await runSync(prisma, tokenManager, apiClient, integration, payload, logger, now);
      logger.info?.('[whoop-sync] Sync completed', {
        userId: payload.userId,
        fetched: result.fetched,
        upserted: result.upserted
      });
      await updateTaskStatus(prisma, metadata.id, 'SUCCEEDED', metadata.attemptCount, { firstAttemptAt: metadata.firstAttemptAt, now });
    } catch (error) {
      logger.error?.('[whoop-sync] Sync failed', {
        userId: payload.userId,
        error: error instanceof Error ? error.message : error
      });
      await updateTaskStatus(
        prisma,
        metadata.id,
        'FAILED',
        metadata.attemptCount,
        { firstAttemptAt: metadata.firstAttemptAt, now },
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  };
};

export const whoopSyncWorker = createWhoopSyncWorker();
