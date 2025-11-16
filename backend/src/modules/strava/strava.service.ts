import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  PrismaClient,
  StravaIntegration,
  StravaLinkSession,
  StravaSyncStatus
} from '@prisma/client';

import env from '../../config/env';
import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import type { TokenCrypto } from '../wearable/token-crypto';
import { stravaTokenCrypto } from './token-crypto';
import {
  StravaOAuthError,
  type StravaAthleteProfile,
  type StravaAuthorizationExchange,
  stravaOAuthClient
} from './oauth-client';
import { StravaApiClient, stravaApiClient, type StravaActivityPayload } from './api-client';

const DEFAULT_SCOPES = ['read', 'activity:read_all'];
const DEFAULT_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_ACTIVITY_PAGES = 3;

type StravaLinkRequest = {
  authorizationCode?: string;
  state?: string;
  redirectUri?: string;
};

type StravaSummary = {
  totalDistanceMeters: number;
  totalMovingTimeSeconds: number;
  activityCount: number;
  longestDistanceMeters: number;
  longestActivityName: string | null;
  generatedAt: string;
};

export type StravaLinkStatus = {
  linked: boolean;
  linkUrl: string | null;
  state: string | null;
  expiresAt: string | null;
  syncStatus: StravaSyncStatus;
  lastSyncAt: string | null;
  athlete: {
    id: number | null;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    city: string | null;
    country: string | null;
  } | null;
  summary: StravaSummary | null;
};

type StravaServiceOptions = Partial<{
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string;
  scopes: string[];
  authorizeUrl: string;
  stateTtlMs: number;
  tokenKeyId: string;
  lookbackDays: number;
  activityPageLimit: number;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

const toJsonValue = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value ? (value as Prisma.InputJsonValue) : Prisma.JsonNull;

const toStravaSummary = (value: Prisma.JsonValue | null): StravaSummary | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const totalDistance = typeof record.totalDistanceMeters === 'number' ? record.totalDistanceMeters : null;
  const totalMoving = typeof record.totalMovingTimeSeconds === 'number' ? record.totalMovingTimeSeconds : null;
  const activityCount = typeof record.activityCount === 'number' ? record.activityCount : null;
  const longestDistance = typeof record.longestDistanceMeters === 'number' ? record.longestDistanceMeters : null;
  const longestName = typeof record.longestActivityName === 'string' ? record.longestActivityName : null;
  const generatedAt = typeof record.generatedAt === 'string' ? record.generatedAt : null;

  if (
    totalDistance === null &&
    totalMoving === null &&
    activityCount === null &&
    longestDistance === null &&
    !longestName
  ) {
    return null;
  }

  return {
    totalDistanceMeters: totalDistance ?? 0,
    totalMovingTimeSeconds: totalMoving ?? 0,
    activityCount: activityCount ?? 0,
    longestDistanceMeters: longestDistance ?? 0,
    longestActivityName: longestName,
    generatedAt: generatedAt ?? new Date().toISOString()
  };
};

const sumNumbers = (values: Array<number | null | undefined>): number =>
  values.reduce((total, value) => (Number.isFinite(value) ? total + Number(value) : total), 0);

export class StravaService {
  private readonly config: Required<Omit<StravaServiceOptions, 'clientId' | 'clientSecret'>> & {
    clientId: string | null;
    clientSecret: string | null;
  };

  constructor(
    private readonly prisma: PrismaClient,
    private readonly oauthClient: typeof stravaOAuthClient,
    private readonly apiClient: StravaApiClient,
    private readonly tokenCrypto: TokenCrypto,
    private readonly stateFactory: () => string = () => randomUUID(),
    private readonly now: () => Date = () => new Date(),
    options: StravaServiceOptions = {}
  ) {
    this.config = {
      clientId: options.clientId ?? env.STRAVA_CLIENT_ID ?? null,
      clientSecret: options.clientSecret ?? env.STRAVA_CLIENT_SECRET ?? null,
      redirectUri: options.redirectUri ?? env.STRAVA_REDIRECT_URI,
      scopes: options.scopes ?? DEFAULT_SCOPES,
      authorizeUrl: options.authorizeUrl ?? DEFAULT_AUTHORIZE_URL,
      stateTtlMs: options.stateTtlMs ?? DEFAULT_STATE_TTL_MS,
      tokenKeyId: options.tokenKeyId ?? env.STRAVA_TOKEN_KEY_ID,
      lookbackDays: options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
      activityPageLimit: options.activityPageLimit ?? DEFAULT_ACTIVITY_PAGES
    };
  }

  async getStatus(userId: string): Promise<StravaLinkStatus> {
    const [integration, session] = await Promise.all([
      this.prisma.stravaIntegration.findUnique({ where: { userId } }),
      this.prisma.stravaLinkSession.findFirst({
        where: { userId, cancelledAt: null, completedAt: null },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const activeSession =
      session && session.expiresAt > this.now() ? session : session ? await this.markSessionExpired(session) : null;

    return this.toStatus(integration, activeSession);
  }

  async handleLinkRequest(userId: string, payload: StravaLinkRequest): Promise<StravaLinkStatus> {
    if (payload.authorizationCode && payload.state) {
      return this.completeLink({
        userId,
        code: payload.authorizationCode,
        state: payload.state
      });
    }

    return this.initiateLink(userId, payload.redirectUri);
  }

  async unlink(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.stravaActivity.deleteMany({ where: { userId } });
      await tx.stravaIntegration
        .delete({
          where: { userId }
        })
        .catch((error: unknown) => {
          if ((error as { code?: string }).code !== 'P2025') {
            throw error;
          }
        });

      await tx.stravaLinkSession.updateMany({
        where: {
          userId,
          cancelledAt: null,
          completedAt: null
        },
        data: {
          cancelledAt: this.now()
        }
      });
    });
  }

  private async initiateLink(userId: string, redirectOverride?: string): Promise<StravaLinkStatus> {
    this.ensureConfigured();

    await this.prisma.$transaction(async (tx) => {
      const now = this.now();
      const expiresAt = new Date(now.getTime() + this.config.stateTtlMs);
      const state = this.stateFactory();
      const redirectUri = redirectOverride ?? this.config.redirectUri;

      await tx.stravaLinkSession.updateMany({
        where: {
          userId,
          cancelledAt: null,
          completedAt: null
        },
        data: {
          cancelledAt: now
        }
      });

      await tx.stravaLinkSession.create({
        data: {
          userId,
          state,
          redirectUri,
          scope: this.config.scopes,
          expiresAt
        }
      });
    });

    return this.getStatus(userId);
  }

  private async completeLink(input: { userId: string; code: string; state: string }): Promise<StravaLinkStatus> {
    this.ensureConfigured();

    const session = await this.prisma.stravaLinkSession.findUnique({ where: { state: input.state } });
    if (!session || session.userId !== input.userId || session.cancelledAt || session.completedAt) {
      throw new HttpError(422, 'Link session is invalid or expired.', 'STRAVA_LINK_INVALID');
    }

    if (session.expiresAt <= this.now()) {
      await this.markSessionExpired(session);
      throw new HttpError(422, 'Link session is invalid or expired.', 'STRAVA_LINK_INVALID');
    }

    let exchange: StravaAuthorizationExchange;
    try {
      exchange = await this.oauthClient.exchangeCode({
        code: input.code,
        redirectUri: session.redirectUri
      });
    } catch (error) {
      if (error instanceof StravaOAuthError) {
        throw new HttpError(502, 'Unable to complete Strava OAuth exchange.', 'STRAVA_LINK_FAILED');
      }
      throw error;
    }

    const now = this.now();
    const encryptedAccess = this.tokenCrypto.encrypt(exchange.accessToken);
    const encryptedRefresh = this.tokenCrypto.encrypt(exchange.refreshToken);
    const athleteName = this.buildAthleteName(exchange.athlete);
    const scope = exchange.scope.length > 0 ? exchange.scope : this.config.scopes;

    let integration: StravaIntegration;

    await this.prisma.$transaction(async (tx) => {
      await tx.stravaLinkSession.update({
        where: { id: session.id },
        data: {
          completedAt: now
        }
      });

      await tx.stravaLinkSession.updateMany({
        where: {
          userId: session.userId,
          cancelledAt: null,
          completedAt: null,
          id: { not: session.id }
        },
        data: {
          cancelledAt: now
        }
      });

      integration = await tx.stravaIntegration.upsert({
        where: { userId: session.userId },
        update: {
          athleteId: exchange.athlete?.id ?? null,
          athleteUsername: exchange.athlete?.username ?? null,
          athleteName,
          athleteAvatarUrl: exchange.athlete?.profile ?? null,
          athleteCity: exchange.athlete?.city ?? null,
          athleteCountry: exchange.athlete?.country ?? null,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          expiresAt: exchange.expiresAt,
          scope,
          syncStatus: 'PENDING',
          tokenKeyId: this.config.tokenKeyId,
          tokenRotatedAt: now,
          lastSyncedAt: null,
          lastSyncSummary: Prisma.JsonNull,
          updatedAt: now
        },
        create: {
          userId: session.userId,
          athleteId: exchange.athlete?.id ?? null,
          athleteUsername: exchange.athlete?.username ?? null,
          athleteName,
          athleteAvatarUrl: exchange.athlete?.profile ?? null,
          athleteCity: exchange.athlete?.city ?? null,
          athleteCountry: exchange.athlete?.country ?? null,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          expiresAt: exchange.expiresAt,
          scope,
          syncStatus: 'PENDING',
          tokenKeyId: this.config.tokenKeyId,
          tokenRotatedAt: now,
          lastSyncedAt: null,
          lastSyncSummary: Prisma.JsonNull
        }
      });
    });

    await this.syncRecentActivities({
      integration: integration!,
      accessToken: exchange.accessToken
    });

    return this.getStatus(input.userId);
  }

  private async syncRecentActivities(params: { integration: StravaIntegration; accessToken: string }): Promise<void> {
    const lookback = new Date(this.now().getTime() - this.config.lookbackDays * DAY_MS);
    const allActivities: StravaActivityPayload[] = [];

    for (let page = 1; page <= this.config.activityPageLimit; page += 1) {
      const chunk = await this.apiClient
        .listActivities(params.accessToken, {
          after: lookback,
          perPage: 50,
          page
        })
        .catch((error) => {
          throw new HttpError(502, `Failed to fetch Strava activities: ${error instanceof Error ? error.message : error}`, 'STRAVA_SYNC_FAILED');
        });

      if (chunk.length === 0) {
        break;
      }

      allActivities.push(...chunk);

      if (chunk.length < 50) {
        break;
      }
    }

    const summary = this.buildSummary(allActivities);

    await this.prisma.$transaction(async (tx) => {
      for (const activity of allActivities) {
        const id = String(activity.id);
        await tx.stravaActivity.upsert({
          where: { stravaActivityId: id },
          update: this.mapActivityPayload(activity, params.integration),
          create: {
            id: randomUUID(),
            integrationId: params.integration.id,
            userId: params.integration.userId,
            ...this.mapActivityPayload(activity, params.integration),
            stravaActivityId: id
          }
        });
      }

      await tx.stravaIntegration.update({
        where: { id: params.integration.id },
        data: {
          lastSyncedAt: this.now(),
          lastSyncSummary: summary ? toJsonValue(summary) : Prisma.JsonNull,
          syncStatus: 'ACTIVE',
          updatedAt: this.now()
        }
      });
    });
  }

  private buildSummary(activities: StravaActivityPayload[]): StravaSummary | null {
    if (activities.length === 0) {
      return null;
    }

    const totalDistance = sumNumbers(activities.map((activity) => activity.distance ?? null));
    const totalMoving = sumNumbers(activities.map((activity) => activity.moving_time ?? null));
    const activityCount = activities.length;

    let longestDistance = 0;
    let longestActivityName: string | null = null;

    for (const activity of activities) {
      const distance = typeof activity.distance === 'number' ? activity.distance : 0;
      if (distance > longestDistance) {
        longestDistance = distance;
        longestActivityName = activity.name ?? null;
      }
    }

    return {
      totalDistanceMeters: totalDistance,
      totalMovingTimeSeconds: totalMoving,
      activityCount,
      longestDistanceMeters: longestDistance,
      longestActivityName,
      generatedAt: new Date().toISOString()
    };
  }

  private mapActivityPayload(activity: StravaActivityPayload, integration: StravaIntegration) {
    return {
      integrationId: integration.id,
      userId: integration.userId,
      name: activity.name,
      sportType: activity.sport_type ?? activity.type ?? 'Unknown',
      distanceMeters: typeof activity.distance === 'number' ? activity.distance : null,
      movingTimeSeconds: typeof activity.moving_time === 'number' ? activity.moving_time : null,
      elapsedTimeSeconds: typeof activity.elapsed_time === 'number' ? activity.elapsed_time : null,
      elevationGainMeters: typeof activity.total_elevation_gain === 'number' ? activity.total_elevation_gain : null,
      averageSpeedMps: typeof activity.average_speed === 'number' ? activity.average_speed : null,
      maxSpeedMps: typeof activity.max_speed === 'number' ? activity.max_speed : null,
      averageWatts: typeof activity.average_watts === 'number' ? activity.average_watts : null,
      maxWatts: typeof activity.max_watts === 'number' ? activity.max_watts : null,
      sufferScore: typeof activity.suffer_score === 'number' ? activity.suffer_score : null,
      achievements: typeof activity.achievement_count === 'number' ? activity.achievement_count : null,
      kudosCount: typeof activity.kudos_count === 'number' ? activity.kudos_count : null,
      startDate: new Date(activity.start_date),
      startDateLocal: activity.start_date_local ? new Date(activity.start_date_local) : null,
      isCommute: typeof activity.commute === 'boolean' ? activity.commute : null,
      isTrainer: typeof activity.trainer === 'boolean' ? activity.trainer : null,
      rawPayload: toJsonValue(activity)
    };
  }

  private toStatus(integration: StravaIntegration | null, session: StravaLinkSession | null): StravaLinkStatus {
    const linked = Boolean(integration && integration.accessToken && integration.syncStatus !== 'REVOKED');
    const linkable = Boolean(this.config.clientId && this.config.clientSecret);
    const sessionAvailable = !linked && linkable && session;

    return {
      linked,
      linkUrl: sessionAvailable ? this.buildAuthorizeUrl(session!) : null,
      state: sessionAvailable ? session!.state : null,
      expiresAt: sessionAvailable ? session!.expiresAt.toISOString() : null,
      syncStatus: integration?.syncStatus ?? 'PENDING',
      lastSyncAt: integration?.lastSyncedAt ? integration.lastSyncedAt.toISOString() : null,
      athlete: integration
        ? {
            id: integration.athleteId ?? null,
            name: integration.athleteName ?? null,
            username: integration.athleteUsername ?? null,
            avatarUrl: integration.athleteAvatarUrl ?? null,
            city: integration.athleteCity ?? null,
            country: integration.athleteCountry ?? null
          }
        : null,
      summary: toStravaSummary(integration?.lastSyncSummary ?? null)
    };
  }

  private buildAuthorizeUrl(session: StravaLinkSession): string {
    return this.oauthClient.buildAuthorizeUrl({
      state: session.state,
      redirectUri: session.redirectUri,
      scope: session.scope,
      approvalPrompt: 'auto'
    });
  }

  private ensureConfigured(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new HttpError(503, 'Strava integration is not configured for this environment.', 'STRAVA_NOT_CONFIGURED');
    }
  }

  private async markSessionExpired(session: StravaLinkSession): Promise<StravaLinkSession | null> {
    if (session.cancelledAt || session.completedAt) {
      return null;
    }

    await this.prisma.stravaLinkSession.update({
      where: { id: session.id },
      data: { cancelledAt: this.now() }
    });

    return null;
  }

  private buildAthleteName(athlete: StravaAthleteProfile): string | null {
    if (!athlete) {
      return null;
    }

    const parts = [athlete.firstname, athlete.lastname].filter((part): part is string => Boolean(part && part.trim()));
    if (parts.length === 0) {
      return athlete.username ?? null;
    }

    return parts.join(' ');
  }
}

export const stravaService = new StravaService(
  prismaClient,
  stravaOAuthClient,
  stravaApiClient,
  stravaTokenCrypto,
  () => randomUUID(),
  () => new Date()
);

