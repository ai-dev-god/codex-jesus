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
  type WhoopListResponse
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

const toDecimal = (value: unknown): Prisma.Decimal | null => {
  const num = toNumber(value);
  if (num === null) {
    return null;
  }
  return new Prisma.Decimal(num.toFixed(2));
};

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
  table: 'whoopWorkout' | 'whoopCycle' | 'whoopSleep',
  now: Date
): Promise<Date> => {
  // We cast to any because we are accessing dynamic model names which all have startTime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[table];

  const lastRecord = await model.findFirst({
    where: { userId },
    orderBy: { startTime: 'desc' }
  });

  if (!lastRecord) {
    return new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  }

  const bufferMs = BUFFER_HOURS * 60 * 60 * 1000;
  return new Date(lastRecord.startTime.getTime() - bufferMs);
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

  // Prisma types might not be generated for this yet if running in sandbox without generation
  // using any to bypass strict check against potentially missing models
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any).whoopCycle;

  await delegate.upsert({
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
  const score = record.score ?? {};
  // Recovery endpoint doesn't give a unique ID in the payload usually, but we can use cycle_id as unique key
  // Or check if the record has an ID. The type definition says it has cycle_id.
  // Actually, docs say recovery is linked to a cycle.
  const whoopRecoveryId = String(record.cycle_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any).whoopRecovery;

  await delegate.upsert({
    where: { whoopRecoveryId },
    update: {
      userId,
      whoopUserId,
      cycleId: String(record.cycle_id),
      sleepId: record.sleep_id ? String(record.sleep_id) : null,
      scoreState: record.score_state ?? null,
      recoveryScore: toInt(score.recovery_score),
      restingHeartRate: toInt(score.resting_heart_rate),
      hrvRmssdMilli: toDecimal(score.hrv_rmssd_milli),
      spo2Percentage: toDecimal(score.spo2_percentage),
      skinTempCelsius: toDecimal(score.skin_temp_celsius),
      userCalibrating: Boolean(score.user_calibrating),
      rawPayload: record as Prisma.InputJsonValue
    },
    create: {
      userId,
      whoopUserId,
      whoopRecoveryId,
      cycleId: String(record.cycle_id),
      sleepId: record.sleep_id ? String(record.sleep_id) : null,
      scoreState: record.score_state ?? null,
      recoveryScore: toInt(score.recovery_score),
      restingHeartRate: toInt(score.resting_heart_rate),
      hrvRmssdMilli: toDecimal(score.hrv_rmssd_milli),
      spo2Percentage: toDecimal(score.spo2_percentage),
      skinTempCelsius: toDecimal(score.skin_temp_celsius),
      userCalibrating: Boolean(score.user_calibrating),
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

  const score = record.score ?? {};
  const stage = score.stage_summary ?? {};
  const whoopSleepId = String(record.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any).whoopSleep;

  await delegate.upsert({
    where: { whoopSleepId },
    update: {
      userId,
      whoopUserId,
      startTime,
      endTime,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      nap: Boolean(record.nap),
      scoreState: record.score_state ?? null,
      totalInBedTimeMilli: toInt(stage.total_in_bed_time_milli),
      totalAwakeTimeMilli: toInt(stage.total_awake_time_milli),
      totalNoDataTimeMilli: toInt(stage.total_no_data_time_milli),
      totalLightSleepTimeMilli: toInt(stage.total_light_sleep_time_milli),
      totalSlowWaveSleepTimeMilli: toInt(stage.total_slow_wave_sleep_time_milli),
      totalRemSleepTimeMilli: toInt(stage.total_rem_sleep_time_milli),
      sleepCycleCount: toInt(stage.sleep_cycle_count),
      disturbanceCount: toInt(stage.disturbance_count),
      sleepScore: toInt(score.sleep_performance_percentage),
      respiratoryRate: toDecimal(score.respiratory_rate),
      sleepEfficiency: toDecimal(score.sleep_efficiency_percentage),
      sleepConsistency: toDecimal(score.sleep_consistency_percentage),
      rawPayload: record as Prisma.InputJsonValue
    },
    create: {
      userId,
      whoopUserId,
      whoopSleepId,
      startTime,
      endTime,
      timezoneOffsetMinutes: toInt(record.timezone_offset),
      nap: Boolean(record.nap),
      scoreState: record.score_state ?? null,
      totalInBedTimeMilli: toInt(stage.total_in_bed_time_milli),
      totalAwakeTimeMilli: toInt(stage.total_awake_time_milli),
      totalNoDataTimeMilli: toInt(stage.total_no_data_time_milli),
      totalLightSleepTimeMilli: toInt(stage.total_light_sleep_time_milli),
      totalSlowWaveSleepTimeMilli: toInt(stage.total_slow_wave_sleep_time_milli),
      totalRemSleepTimeMilli: toInt(stage.total_rem_sleep_time_milli),
      sleepCycleCount: toInt(stage.sleep_cycle_count),
      disturbanceCount: toInt(stage.disturbance_count),
      sleepScore: toInt(score.sleep_performance_percentage),
      respiratoryRate: toDecimal(score.respiratory_rate),
      sleepEfficiency: toDecimal(score.sleep_efficiency_percentage),
      sleepConsistency: toDecimal(score.sleep_consistency_percentage),
      rawPayload: record as Prisma.InputJsonValue
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

// Generic fetcher to handle pagination for any endpoint
const fetchAll = async <T>(
    fetchPage: (cursor: string | null) => Promise<WhoopListResponse<T>>,
    processRecord: (record: T) => Promise<void>,
    logger: Pick<Console, 'info' | 'warn' | 'error'>,
    userId: string,
    type: string
): Promise<{ fetched: number; upserted: number }> => {
    let cursor: string | null = null;
    let fetched = 0;
    let upserted = 0;

    do {
        const response = await fetchPage(cursor);
        fetched += response.records.length;

        for (const record of response.records) {
            try {
                await processRecord(record);
                upserted += 1;
            } catch (error) {
                logger.warn?.(`[whoop-sync] Failed to persist ${type}`, {
                    userId,
                    error: error instanceof Error ? error.message : error
                });
            }
        }
        cursor = response.nextCursor;
    } while (cursor);

    return { fetched, upserted };
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

  let totalFetched = 0;
  let totalUpserted = 0;

  // 1. Sync Cycles
  const cycleStartTime = await resolveStartTime(prisma, payload.userId, 'whoopCycle', now);
  const cyclesResult = await fetchAll<WhoopCycleRecord>(
      (cursor) => apiClient.listCycles(accessToken, { start: cycleStartTime, cursor, limit: PAGE_LIMIT }),
      (record) => upsertCycle(prisma, payload.userId, payload.whoopUserId, record),
      logger,
      payload.userId,
      'cycle'
  );
  totalFetched += cyclesResult.fetched;
  totalUpserted += cyclesResult.upserted;

  // 2. Sync Workouts
  const workoutStartTime = await resolveStartTime(prisma, payload.userId, 'whoopWorkout', now);
  const workoutsResult = await fetchAll<WhoopWorkoutRecord>(
      (cursor) => apiClient.listWorkouts(accessToken, { start: workoutStartTime, cursor, limit: PAGE_LIMIT }),
      (record) => upsertWorkout(prisma, payload.userId, payload.whoopUserId, record),
      logger,
      payload.userId,
      'workout'
  );
  totalFetched += workoutsResult.fetched;
  totalUpserted += workoutsResult.upserted;

  // 3. Sync Sleep
  const sleepStartTime = await resolveStartTime(prisma, payload.userId, 'whoopSleep', now);
  const sleepResult = await fetchAll<WhoopSleepRecord>(
      (cursor) => apiClient.listSleep(accessToken, { start: sleepStartTime, cursor, limit: PAGE_LIMIT }),
      (record) => upsertSleep(prisma, payload.userId, payload.whoopUserId, record),
      logger,
      payload.userId,
      'sleep'
  );
  totalFetched += sleepResult.fetched;
  totalUpserted += sleepResult.upserted;

  // 4. Sync Recovery
  // Recovery is typically tied to a cycle or day. We can use the cycleStartTime as a heuristic.
  const recoveryResult = await fetchAll<WhoopRecoveryRecord>(
      (cursor) => apiClient.listRecovery(accessToken, { start: cycleStartTime, cursor, limit: PAGE_LIMIT }),
      (record) => upsertRecovery(prisma, payload.userId, payload.whoopUserId, record),
      logger,
      payload.userId,
      'recovery'
  );
  totalFetched += recoveryResult.fetched;
  totalUpserted += recoveryResult.upserted;

  await prisma.whoopIntegration.update({
    where: { id: integration.id },
    data: {
      lastSyncedAt: now,
      syncStatus: 'ACTIVE',
      updatedAt: now
    }
  });

  return { fetched: totalFetched, upserted: totalUpserted };
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
