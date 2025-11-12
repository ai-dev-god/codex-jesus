import type { Prisma, PrismaClient, Profile as PrismaProfile } from '@prisma/client';
import { UserStatus as PrismaUserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import prismaClient from '../../lib/prisma';
import { tokenService } from '../identity/token-service';
import { HttpError } from '../observability-ops/http-error';

type ConsentRecord = {
  type: string;
  granted: boolean;
  grantedAt: string | null;
  metadata: Record<string, unknown> | null;
};

type ConsentInput = {
  type: string;
  granted: boolean;
  grantedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type ProfileUpdateInput = {
  displayName?: string;
  timezone?: string;
  baselineSurvey?: Record<string, unknown>;
  consents?: ConsentInput[];
};

type DataExportStatus = {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  requestedAt: Date;
  completedAt: Date | null;
  downloadUrl: string | null;
  expiresAt: Date | null;
  failureReason: string | null;
};

type CompletionTokens = {
  access: {
    token: string;
    expiresIn: number;
  };
};

type ProfileDto = Omit<PrismaProfile, 'baselineSurvey' | 'consents'> & {
  baselineSurvey: Record<string, unknown> | null;
  consents: ConsentRecord[];
  tokens?: CompletionTokens;
};

const REQUIRED_CONSENT_TYPES = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'MEDICAL_DISCLAIMER'];

const isJsonObject = (value: Prisma.JsonValue | null): value is Prisma.JsonObject =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const parseBaselineSurvey = (value: Prisma.JsonValue | null): Record<string, unknown> | null => {
  if (!isJsonObject(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const parseConsents = (value: Prisma.JsonValue | null): ConsentRecord[] => {
  if (!value || !Array.isArray(value)) {
    return [];
  }

  const records: ConsentRecord[] = [];

  for (const entry of value as Prisma.JsonArray) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const payload = entry as Record<string, unknown>;
    const type = typeof payload.type === 'string' ? payload.type : null;
    const granted = typeof payload.granted === 'boolean' ? payload.granted : null;

    if (!type || granted === null) {
      continue;
    }

    const grantedAt = typeof payload.grantedAt === 'string' ? payload.grantedAt : null;
    const metadata =
      payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
        ? (payload.metadata as Record<string, unknown>)
        : null;

    records.push({
      type,
      granted,
      grantedAt,
      metadata
    });
  }

  return records;
};

const cloneAsJsonValue = (value: unknown): Prisma.JsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;

const serializeConsents = (consents: ConsentRecord[]): Prisma.JsonArray =>
  consents.map((consent) =>
    cloneAsJsonValue({
      type: consent.type,
      granted: consent.granted,
      grantedAt: consent.grantedAt,
      metadata: consent.metadata
    })
  ) as Prisma.JsonArray;

const isValidTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

const normaliseConsentInput = (input: ConsentInput, previous?: ConsentRecord): ConsentRecord => {
  const grantedAt =
    input.granted === true
      ? input.grantedAt ?? previous?.grantedAt ?? new Date().toISOString()
      : input.grantedAt ?? null;

  return {
    type: input.type,
    granted: input.granted,
    grantedAt,
    metadata: (input.metadata ?? previous?.metadata) ?? null
  };
};

const mergeConsents = (existing: ConsentRecord[], updates: ConsentInput[]): ConsentRecord[] => {
  const map = new Map(existing.map((consent) => [consent.type, consent]));

  for (const update of updates) {
    const current = map.get(update.type);
    map.set(update.type, normaliseConsentInput(update, current));
  }

  return Array.from(map.values());
};

const shouldMarkOnboardingComplete = (profile: ProfileDto): boolean => {
  const hasBaseline = profile.baselineSurvey !== null && Object.keys(profile.baselineSurvey).length > 0;
  const hasTimezone = typeof profile.timezone === 'string' && profile.timezone.length > 0;
  const hasRequiredConsents = REQUIRED_CONSENT_TYPES.every((type) =>
    profile.consents.some((consent) => consent.type === type && consent.granted)
  );

  return hasBaseline && hasTimezone && hasRequiredConsents;
};

export class OnboardingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly idFactory: () => string = () => randomUUID()
  ) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
    }

    return this.mapProfile(profile);
  }

  async updateProfile(userId: string, input: ProfileUpdateInput): Promise<ProfileDto> {
    if (input.baselineSurvey && Object.keys(input.baselineSurvey).length === 0) {
      throw new HttpError(422, 'Baseline survey cannot be empty', 'VALIDATION_ERROR', {
        baselineSurvey: ['Baseline survey cannot be empty']
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.profile.findUnique({ where: { userId } });
      if (!existing) {
        throw new HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
      }

      if (input.timezone && !isValidTimezone(input.timezone)) {
        throw new HttpError(422, 'Timezone must be a valid IANA identifier', 'VALIDATION_ERROR', {
          timezone: ['Invalid timezone']
        });
      }

      const existingDto = this.mapProfile(existing);
      const mergedConsents = input.consents ? mergeConsents(existingDto.consents, input.consents) : existingDto.consents;

      const prospective: ProfileDto = {
        ...existingDto,
        displayName: input.displayName ?? existingDto.displayName,
        timezone: input.timezone ?? existingDto.timezone,
        baselineSurvey: input.baselineSurvey ?? existingDto.baselineSurvey,
        consents: mergedConsents,
        deleteRequested: existingDto.deleteRequested
      };

      const shouldComplete = shouldMarkOnboardingComplete(prospective);
      const profileUpdate: Prisma.ProfileUpdateInput = {};

      if (input.displayName !== undefined) {
        profileUpdate.displayName = input.displayName;
      }

      if (input.timezone !== undefined) {
        profileUpdate.timezone = input.timezone;
      }

      if (input.baselineSurvey !== undefined) {
        profileUpdate.baselineSurvey = cloneAsJsonValue(input.baselineSurvey) as Prisma.InputJsonValue;
      }

      if (input.consents !== undefined) {
        profileUpdate.consents = serializeConsents(mergedConsents);
      }

      let issuedTokens: CompletionTokens | undefined;
      if (shouldComplete && existing.onboardingCompletedAt === null) {
        const completedAt = new Date();
        profileUpdate.onboardingCompletedAt = completedAt;

        const promotedUser = await tx.user.update({
          where: { id: userId },
          data: { status: PrismaUserStatus.ACTIVE },
          select: {
            id: true,
            email: true,
            role: true,
            status: true
          }
        });

        issuedTokens = {
          access: tokenService.issueAccessToken({
            id: promotedUser.id,
            email: promotedUser.email ?? '',
            role: promotedUser.role,
            status: promotedUser.status
          })
        };
      }

      const updated = await tx.profile.update({
        where: { userId },
        data: profileUpdate
      });

      const profile = this.mapProfile(updated);
      if (issuedTokens) {
        profile.tokens = issuedTokens;
      }

      return profile;
    });
  }

  async requestDataExport(userId: string): Promise<DataExportStatus> {
    const now = new Date();
    const requestId = this.idFactory();

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: userId,
        action: 'PROFILE_DATA_EXPORT_REQUESTED',
        targetType: 'DATA_EXPORT_REQUEST',
        targetId: requestId,
        metadata: cloneAsJsonValue({
          status: 'PENDING',
          requestedAt: now.toISOString()
        }) as Prisma.InputJsonValue
      }
    });

    return {
      id: requestId,
      status: 'PENDING',
      requestedAt: now,
      completedAt: null,
      downloadUrl: null,
      expiresAt: null,
      failureReason: null
    };
  }

  async getDataExportRequest(userId: string, requestId: string): Promise<DataExportStatus> {
    const record = await this.prisma.adminAuditLog.findFirst({
      where: {
        actorId: userId,
        targetType: 'DATA_EXPORT_REQUEST',
        targetId: requestId
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!record) {
      throw new HttpError(404, 'Data export request not found', 'DATA_EXPORT_NOT_FOUND');
    }

    return {
      id: requestId,
      status: 'PENDING',
      requestedAt: record.createdAt,
      completedAt: null,
      downloadUrl: null,
      expiresAt: null,
      failureReason: null
    };
  }

  async requestDataDeletion(userId: string): Promise<{ requestedAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) {
        throw new HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
      }

      if (profile.deleteRequested) {
        throw new HttpError(409, 'Deletion already requested', 'PROFILE_DELETE_PENDING');
      }

      const requestedAt = new Date();

      await tx.profile.update({
        where: { userId },
        data: {
          deleteRequested: true
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorId: userId,
          action: 'PROFILE_DATA_DELETE_REQUESTED',
          targetType: 'DATA_DELETE_REQUEST',
          targetId: userId,
          metadata: cloneAsJsonValue({
            requestedAt: requestedAt.toISOString()
          }) as Prisma.InputJsonValue
        }
      });

      return { requestedAt };
    });
  }

  private mapProfile(profile: PrismaProfile): ProfileDto {
    const { baselineSurvey, consents, ...rest } = profile;

    return {
      ...rest,
      baselineSurvey: parseBaselineSurvey(baselineSurvey),
      consents: parseConsents(consents)
    };
  }
}

export const onboardingService = new OnboardingService(prismaClient);
