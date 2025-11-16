import { Prisma } from '@prisma/client';
import type { PrismaClient, WhoopIntegration } from '@prisma/client';

import prismaClient from '../lib/prisma';
import {
  WHOOP_SYNC_QUEUE,
  WHOOP_SYNC_RETRY_CONFIG,
  type WhoopSyncTaskPayload
} from '../modules/wearable/whoop-sync-queue';
import { WhoopApiClient, type WhoopWorkoutRecord } from '../modules/wearable/whoop-api.client';
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

const resolveStartTime = async (prisma: PrismaClient, userId: string, now: Date): Promise<Date> => {
  const lastWorkout = await prisma.whoopWorkout.findFirst({
    where: { userId },
    orderBy: { startTime: 'desc' }
  });

  if (!lastWorkout) {
    return new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  }

  const bufferMs = BUFFER_HOURS * 60 * 60 * 1000;
  return new Date(lastWorkout.startTime.getTime() - bufferMs);
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
      rawPayload: record
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
      rawPayload: record
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

  const startTime = await resolveStartTime(prisma, payload.userId, now);
  let cursor: string | null = null;
  let fetched = 0;
  let upserted = 0;

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
