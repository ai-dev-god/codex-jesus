"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingService = exports.OnboardingService = void 0;
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const token_service_1 = require("../identity/token-service");
const http_error_1 = require("../observability-ops/http-error");
const REQUIRED_CONSENT_TYPES = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'MEDICAL_DISCLAIMER'];
const isJsonObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const parseBaselineSurvey = (value) => {
    if (!isJsonObject(value)) {
        return null;
    }
    return value;
};
const parseConsents = (value) => {
    if (!value || !Array.isArray(value)) {
        return [];
    }
    const records = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            continue;
        }
        const payload = entry;
        const type = typeof payload.type === 'string' ? payload.type : null;
        const granted = typeof payload.granted === 'boolean' ? payload.granted : null;
        if (!type || granted === null) {
            continue;
        }
        const grantedAt = typeof payload.grantedAt === 'string' ? payload.grantedAt : null;
        const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
            ? payload.metadata
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
const cloneAsJsonValue = (value) => JSON.parse(JSON.stringify(value));
const serializeConsents = (consents) => consents.map((consent) => cloneAsJsonValue({
    type: consent.type,
    granted: consent.granted,
    grantedAt: consent.grantedAt,
    metadata: consent.metadata
}));
const isValidTimezone = (timezone) => {
    try {
        Intl.DateTimeFormat('en-US', { timeZone: timezone });
        return true;
    }
    catch {
        return false;
    }
};
const normaliseConsentInput = (input, previous) => {
    const grantedAt = input.granted === true
        ? input.grantedAt ?? previous?.grantedAt ?? new Date().toISOString()
        : input.grantedAt ?? null;
    return {
        type: input.type,
        granted: input.granted,
        grantedAt,
        metadata: (input.metadata ?? previous?.metadata) ?? null
    };
};
const mergeConsents = (existing, updates) => {
    const map = new Map(existing.map((consent) => [consent.type, consent]));
    for (const update of updates) {
        const current = map.get(update.type);
        map.set(update.type, normaliseConsentInput(update, current));
    }
    return Array.from(map.values());
};
const shouldMarkOnboardingComplete = (profile) => {
    const hasBaseline = profile.baselineSurvey !== null && Object.keys(profile.baselineSurvey).length > 0;
    const hasTimezone = typeof profile.timezone === 'string' && profile.timezone.length > 0;
    const hasRequiredConsents = REQUIRED_CONSENT_TYPES.every((type) => profile.consents.some((consent) => consent.type === type && consent.granted));
    return hasBaseline && hasTimezone && hasRequiredConsents;
};
class OnboardingService {
    constructor(prisma, idFactory = () => (0, node_crypto_1.randomUUID)()) {
        this.prisma = prisma;
        this.idFactory = idFactory;
    }
    async getProfile(userId) {
        const profile = await this.prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            throw new http_error_1.HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
        }
        return this.mapProfile(profile);
    }
    async updateProfile(userId, input) {
        if (input.baselineSurvey && Object.keys(input.baselineSurvey).length === 0) {
            throw new http_error_1.HttpError(422, 'Baseline survey cannot be empty', 'VALIDATION_ERROR', {
                baselineSurvey: ['Baseline survey cannot be empty']
            });
        }
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.profile.findUnique({ where: { userId } });
            if (!existing) {
                throw new http_error_1.HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
            }
            if (input.timezone && !isValidTimezone(input.timezone)) {
                throw new http_error_1.HttpError(422, 'Timezone must be a valid IANA identifier', 'VALIDATION_ERROR', {
                    timezone: ['Invalid timezone']
                });
            }
            const existingDto = this.mapProfile(existing);
            const mergedConsents = input.consents ? mergeConsents(existingDto.consents, input.consents) : existingDto.consents;
            const prospective = {
                ...existingDto,
                displayName: input.displayName ?? existingDto.displayName,
                timezone: input.timezone ?? existingDto.timezone,
                baselineSurvey: input.baselineSurvey ?? existingDto.baselineSurvey,
                consents: mergedConsents,
                deleteRequested: existingDto.deleteRequested
            };
            const shouldComplete = shouldMarkOnboardingComplete(prospective);
            const profileUpdate = {};
            if (input.displayName !== undefined) {
                profileUpdate.displayName = input.displayName;
            }
            if (input.timezone !== undefined) {
                profileUpdate.timezone = input.timezone;
            }
            if (input.baselineSurvey !== undefined) {
                profileUpdate.baselineSurvey = cloneAsJsonValue(input.baselineSurvey);
            }
            if (input.consents !== undefined) {
                profileUpdate.consents = serializeConsents(mergedConsents);
            }
            let issuedTokens;
            if (shouldComplete && existing.onboardingCompletedAt === null) {
                const completedAt = new Date();
                profileUpdate.onboardingCompletedAt = completedAt;
                const promotedUser = await tx.user.update({
                    where: { id: userId },
                    data: { status: client_1.UserStatus.ACTIVE },
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        status: true
                    }
                });
                issuedTokens = {
                    access: token_service_1.tokenService.issueAccessToken({
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
    async requestDataExport(userId) {
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
                })
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
    async getDataExportRequest(userId, requestId) {
        const record = await this.prisma.adminAuditLog.findFirst({
            where: {
                actorId: userId,
                targetType: 'DATA_EXPORT_REQUEST',
                targetId: requestId
            },
            orderBy: { createdAt: 'desc' }
        });
        if (!record) {
            throw new http_error_1.HttpError(404, 'Data export request not found', 'DATA_EXPORT_NOT_FOUND');
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
    async requestDataDeletion(userId) {
        return this.prisma.$transaction(async (tx) => {
            const profile = await tx.profile.findUnique({ where: { userId } });
            if (!profile) {
                throw new http_error_1.HttpError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
            }
            if (profile.deleteRequested) {
                throw new http_error_1.HttpError(409, 'Deletion already requested', 'PROFILE_DELETE_PENDING');
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
                    })
                }
            });
            return { requestedAt };
        });
    }
    mapProfile(profile) {
        const { baselineSurvey, consents, ...rest } = profile;
        return {
            ...rest,
            baselineSurvey: parseBaselineSurvey(baselineSurvey),
            consents: parseConsents(consents)
        };
    }
}
exports.OnboardingService = OnboardingService;
exports.onboardingService = new OnboardingService(prisma_1.default);
