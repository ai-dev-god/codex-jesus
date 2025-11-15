"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.biomarkerService = exports.BiomarkerService = void 0;
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const dashboard_service_1 = require("../dashboard/dashboard.service");
const biomarkerOrSlugCondition = (identifier) => ({
    OR: [{ id: identifier }, { slug: identifier }]
});
const decimalToNumber = (value) => {
    if (value === null) {
        return null;
    }
    return Number(value);
};
const toJson = (value) => JSON.parse(JSON.stringify(value));
class BiomarkerService {
    constructor(prisma = prisma_1.default, idFactory = node_crypto_1.randomUUID) {
        this.prisma = prisma;
        this.idFactory = idFactory;
    }
    async listDefinitions() {
        const records = await this.prisma.biomarker.findMany({
            orderBy: { name: 'asc' }
        });
        return records.map((record) => this.mapBiomarker(record));
    }
    async getDefinition(identifier) {
        const record = await this.prisma.biomarker.findFirst({
            where: biomarkerOrSlugCondition(identifier)
        });
        if (!record) {
            throw new http_error_1.HttpError(404, 'Biomarker not found', 'BIOMARKER_NOT_FOUND');
        }
        return this.mapBiomarker(record);
    }
    async createDefinition(actorId, input) {
        try {
            const created = await this.prisma.biomarker.create({
                data: {
                    id: this.idFactory(),
                    slug: input.slug,
                    name: input.name,
                    unit: input.unit,
                    referenceLow: input.referenceLow === null || input.referenceLow === undefined
                        ? null
                        : new client_1.Prisma.Decimal(input.referenceLow),
                    referenceHigh: input.referenceHigh === null || input.referenceHigh === undefined
                        ? null
                        : new client_1.Prisma.Decimal(input.referenceHigh),
                    source: input.source
                }
            });
            await this.prisma.adminAuditLog.create({
                data: {
                    actorId,
                    action: 'BIOMARKER_CREATED',
                    targetType: 'BIOMARKER',
                    targetId: created.id,
                    metadata: toJson({
                        biomarkerId: created.id,
                        slug: created.slug
                    })
                }
            });
            return this.mapBiomarker(created);
        }
        catch (error) {
            if (this.isUniqueConstraintViolation(error)) {
                throw new http_error_1.HttpError(409, 'Biomarker slug already exists', 'BIOMARKER_SLUG_EXISTS');
            }
            throw error;
        }
    }
    async updateDefinition(actorId, identifier, input) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.biomarker.findFirst({
                where: biomarkerOrSlugCondition(identifier)
            });
            if (!existing) {
                throw new http_error_1.HttpError(404, 'Biomarker not found', 'BIOMARKER_NOT_FOUND');
            }
            const data = {};
            if (input.name !== undefined) {
                data.name = input.name;
            }
            if (input.unit !== undefined) {
                data.unit = input.unit;
            }
            if (input.source !== undefined) {
                data.source = input.source;
            }
            if (input.referenceLow !== undefined) {
                data.referenceLow =
                    input.referenceLow === null ? null : new client_1.Prisma.Decimal(input.referenceLow);
            }
            if (input.referenceHigh !== undefined) {
                data.referenceHigh =
                    input.referenceHigh === null ? null : new client_1.Prisma.Decimal(input.referenceHigh);
            }
            const updateResult = await tx.biomarker.updateMany({
                where: {
                    id: existing.id,
                    updatedAt: input.expectedUpdatedAt
                },
                data
            });
            if (updateResult.count === 0) {
                throw new http_error_1.HttpError(409, 'Biomarker was modified by another request', 'BIOMARKER_CONFLICT');
            }
            const updated = await tx.biomarker.findUnique({
                where: { id: existing.id }
            });
            if (!updated) {
                throw new http_error_1.HttpError(500, 'Failed to load biomarker after update', 'BIOMARKER_UPDATE_FAILED');
            }
            const changes = this.extractBiomarkerChanges(existing, updated);
            if (Object.keys(changes).length > 0) {
                await tx.adminAuditLog.create({
                    data: {
                        actorId,
                        action: 'BIOMARKER_UPDATED',
                        targetType: 'BIOMARKER',
                        targetId: existing.id,
                        metadata: toJson({
                            biomarkerId: existing.id,
                            changes
                        })
                    }
                });
            }
            return this.mapBiomarker(updated);
        });
    }
    async deleteDefinition(actorId, identifier, expectedUpdatedAt) {
        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.biomarker.findFirst({
                where: biomarkerOrSlugCondition(identifier)
            });
            if (!existing) {
                throw new http_error_1.HttpError(404, 'Biomarker not found', 'BIOMARKER_NOT_FOUND');
            }
            const deleteResult = await tx.biomarker.deleteMany({
                where: {
                    id: existing.id,
                    updatedAt: expectedUpdatedAt
                }
            });
            if (deleteResult.count === 0) {
                throw new http_error_1.HttpError(409, 'Biomarker was modified by another request', 'BIOMARKER_CONFLICT');
            }
            await tx.adminAuditLog.create({
                data: {
                    actorId,
                    action: 'BIOMARKER_DELETED',
                    targetType: 'BIOMARKER',
                    targetId: existing.id,
                    metadata: toJson({
                        biomarkerId: existing.id,
                        slug: existing.slug
                    })
                }
            });
        });
    }
    async listLogs(userId, options) {
        const take = options.limit;
        const where = {
            userId
        };
        if (options.biomarkerId) {
            const biomarker = await this.prisma.biomarker.findFirst({
                where: biomarkerOrSlugCondition(options.biomarkerId)
            });
            if (!biomarker) {
                throw new http_error_1.HttpError(404, 'Biomarker not found', 'BIOMARKER_NOT_FOUND');
            }
            where.biomarkerId = biomarker.id;
        }
        const logs = await this.prisma.biomarkerLog.findMany({
            where,
            include: {
                biomarker: true
            },
            take: take + 1,
            orderBy: { capturedAt: 'desc' },
            cursor: options.cursor ? { id: options.cursor } : undefined,
            skip: options.cursor ? 1 : 0
        });
        let nextCursor = null;
        let dataSlice = logs;
        if (logs.length > take) {
            const next = logs.pop();
            nextCursor = next.id;
            dataSlice = logs;
        }
        return {
            data: dataSlice.map((log) => this.mapLog(log)),
            nextCursor
        };
    }
    async createManualLog(userId, input) {
        const biomarker = await this.prisma.biomarker.findFirst({
            where: biomarkerOrSlugCondition(input.biomarkerId)
        });
        if (!biomarker) {
            throw new http_error_1.HttpError(404, 'Biomarker not found', 'BIOMARKER_NOT_FOUND');
        }
        if (biomarker.source === client_1.BiomarkerSource.WHOOP && input.source !== client_1.BiomarkerSource.WHOOP) {
            throw new http_error_1.HttpError(400, 'Manual logs are not supported for Whoop-managed biomarkers', 'BIOMARKER_SOURCE_MISMATCH');
        }
        if (input.source === client_1.BiomarkerSource.MANUAL && biomarker.unit && input.unit && biomarker.unit !== input.unit) {
            throw new http_error_1.HttpError(422, `Unit must match biomarker definition (${biomarker.unit})`, 'BIOMARKER_UNIT_MISMATCH');
        }
        const unitToPersist = input.unit ?? biomarker.unit ?? null;
        const created = await this.prisma.biomarkerLog.create({
            data: {
                id: this.idFactory(),
                userId,
                biomarkerId: biomarker.id,
                value: new client_1.Prisma.Decimal(input.value),
                unit: unitToPersist,
                source: input.source,
                capturedAt: input.capturedAt,
                notes: input.notes ?? null,
                accepted: true,
                flagged: false
            },
            include: {
                biomarker: true
            }
        });
        await this.invalidateDashboard(userId);
        return this.mapLog(created);
    }
    async updateManualLog(userId, logId, input) {
        const updatedLog = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.biomarkerLog.findFirst({
                where: {
                    id: logId,
                    userId
                },
                include: {
                    biomarker: true
                }
            });
            if (!existing) {
                throw new http_error_1.HttpError(404, 'Biomarker log not found', 'BIOMARKER_LOG_NOT_FOUND');
            }
            if (!this.isEditableManualLog(existing.source)) {
                throw new http_error_1.HttpError(403, 'Only manual biomarker logs can be modified via this endpoint', 'BIOMARKER_LOG_SOURCE_RESTRICTED');
            }
            const data = {};
            if (input.value !== undefined) {
                data.value = new client_1.Prisma.Decimal(input.value);
            }
            if (input.unit !== undefined) {
                if (existing.biomarker.unit && input.unit !== existing.biomarker.unit) {
                    throw new http_error_1.HttpError(422, `Unit must match biomarker definition (${existing.biomarker.unit})`, 'BIOMARKER_UNIT_MISMATCH');
                }
                data.unit = input.unit ?? null;
            }
            if (input.capturedAt !== undefined) {
                data.capturedAt = input.capturedAt;
            }
            if (input.accepted !== undefined) {
                data.accepted = input.accepted;
            }
            if (input.flagged !== undefined) {
                data.flagged = input.flagged;
            }
            if (input.notes !== undefined) {
                data.notes = input.notes ?? null;
            }
            const updateResult = await tx.biomarkerLog.updateMany({
                where: {
                    id: existing.id,
                    updatedAt: input.expectedUpdatedAt
                },
                data
            });
            if (updateResult.count === 0) {
                throw new http_error_1.HttpError(409, 'Biomarker log was modified by another request', 'BIOMARKER_LOG_CONFLICT');
            }
            const updated = await tx.biomarkerLog.findUnique({
                where: { id: existing.id },
                include: {
                    biomarker: true
                }
            });
            if (!updated) {
                throw new http_error_1.HttpError(500, 'Failed to load biomarker log after update', 'BIOMARKER_LOG_UPDATE_FAILED');
            }
            const changes = this.extractBiomarkerLogChanges(existing, updated);
            if (Object.keys(changes).length > 0) {
                await tx.adminAuditLog.create({
                    data: {
                        actorId: userId,
                        action: 'BIOMARKER_LOG_UPDATED',
                        targetType: 'BIOMARKER_LOG',
                        targetId: existing.id,
                        metadata: toJson({
                            biomarkerLogId: existing.id,
                            changes
                        })
                    }
                });
            }
            return this.mapLog(updated);
        });
        await this.invalidateDashboard(userId);
        return updatedLog;
    }
    async deleteManualLog(userId, logId, expectedUpdatedAt) {
        await this.prisma.$transaction(async (tx) => {
            const existing = await tx.biomarkerLog.findFirst({
                where: {
                    id: logId,
                    userId
                }
            });
            if (!existing) {
                throw new http_error_1.HttpError(404, 'Biomarker log not found', 'BIOMARKER_LOG_NOT_FOUND');
            }
            if (!this.isEditableManualLog(existing.source)) {
                throw new http_error_1.HttpError(403, 'Only manual biomarker logs can be modified via this endpoint', 'BIOMARKER_LOG_SOURCE_RESTRICTED');
            }
            const deleteResult = await tx.biomarkerLog.deleteMany({
                where: {
                    id: existing.id,
                    updatedAt: expectedUpdatedAt
                }
            });
            if (deleteResult.count === 0) {
                throw new http_error_1.HttpError(409, 'Biomarker log was modified by another request', 'BIOMARKER_LOG_CONFLICT');
            }
            await tx.adminAuditLog.create({
                data: {
                    actorId: userId,
                    action: 'BIOMARKER_LOG_DELETED',
                    targetType: 'BIOMARKER_LOG',
                    targetId: existing.id,
                    metadata: toJson({
                        biomarkerLogId: existing.id,
                        biomarkerId: existing.biomarkerId,
                        capturedAt: existing.capturedAt.toISOString()
                    })
                }
            });
        });
        await this.invalidateDashboard(userId);
    }
    mapBiomarker(record) {
        return {
            id: record.id,
            slug: record.slug,
            name: record.name,
            unit: record.unit,
            referenceLow: decimalToNumber(record.referenceLow),
            referenceHigh: decimalToNumber(record.referenceHigh),
            source: record.source,
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString()
        };
    }
    mapLog(record) {
        return {
            id: record.id,
            biomarkerId: record.biomarkerId,
            biomarker: this.mapBiomarker(record.biomarker),
            value: Number(record.value),
            unit: record.unit ?? record.biomarker.unit ?? null,
            source: record.source,
            capturedAt: record.capturedAt.toISOString(),
            accepted: record.accepted,
            flagged: record.flagged,
            notes: record.notes,
            createdAt: record.createdAt.toISOString(),
            updatedAt: record.updatedAt.toISOString()
        };
    }
    extractBiomarkerChanges(previous, next) {
        const changes = {};
        if (previous.name !== next.name) {
            changes.name = { previous: previous.name, next: next.name };
        }
        if (previous.unit !== next.unit) {
            changes.unit = { previous: previous.unit, next: next.unit };
        }
        if (previous.source !== next.source) {
            changes.source = { previous: previous.source, next: next.source };
        }
        const previousLow = decimalToNumber(previous.referenceLow);
        const nextLow = decimalToNumber(next.referenceLow);
        if (previousLow !== nextLow) {
            changes.referenceLow = {
                previous: previousLow,
                next: nextLow
            };
        }
        const previousHigh = decimalToNumber(previous.referenceHigh);
        const nextHigh = decimalToNumber(next.referenceHigh);
        if (previousHigh !== nextHigh) {
            changes.referenceHigh = {
                previous: previousHigh,
                next: nextHigh
            };
        }
        return changes;
    }
    extractBiomarkerLogChanges(previous, next) {
        const changes = {};
        if (!previous.value.equals(next.value)) {
            changes.value = { previous: Number(previous.value), next: Number(next.value) };
        }
        if (previous.unit !== next.unit) {
            changes.unit = { previous: previous.unit, next: next.unit };
        }
        if (previous.capturedAt.getTime() !== next.capturedAt.getTime()) {
            changes.capturedAt = {
                previous: previous.capturedAt.toISOString(),
                next: next.capturedAt.toISOString()
            };
        }
        if (previous.accepted !== next.accepted) {
            changes.accepted = { previous: previous.accepted, next: next.accepted };
        }
        if (previous.flagged !== next.flagged) {
            changes.flagged = { previous: previous.flagged, next: next.flagged };
        }
        if (previous.notes !== next.notes) {
            changes.notes = { previous: previous.notes, next: next.notes };
        }
        return changes;
    }
    isUniqueConstraintViolation(error) {
        return Boolean(typeof error === 'object' &&
            error &&
            'code' in error &&
            error.code === 'P2002');
    }
    isEditableManualLog(source) {
        return source === client_1.BiomarkerSource.MANUAL || source === client_1.BiomarkerSource.LAB_UPLOAD;
    }
    async invalidateDashboard(userId) {
        try {
            await dashboard_service_1.dashboardService.invalidateUser(userId);
        }
        catch (error) {
            console.warn('[biomarkers] Failed to invalidate dashboard cache', error);
        }
    }
}
exports.BiomarkerService = BiomarkerService;
exports.biomarkerService = new BiomarkerService();
