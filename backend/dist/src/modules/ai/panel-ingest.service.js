"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.panelIngestionService = exports.PanelIngestionService = void 0;
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const env_1 = __importDefault(require("../../config/env"));
const toDecimal = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    return new client_1.Prisma.Decimal(value);
};
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;
class PanelIngestionService {
    constructor(prisma, options = {}) {
        this.prisma = prisma;
        this.uploadInclude = {
            measurements: {
                orderBy: { capturedAt: 'desc' },
                take: 5
            },
            plan: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    createdAt: true
                }
            },
            biomarkerTags: {
                include: {
                    biomarker: {
                        select: {
                            id: true,
                            name: true,
                            unit: true
                        }
                    }
                }
            }
        };
        this.now = options.now ?? (() => new Date());
        this.idFactory = options.idFactory ?? (() => (0, node_crypto_1.randomUUID)());
    }
    async recordUpload(userId, input) {
        const measurements = input.measurements ?? [];
        const normalizedPayload = input.normalizedPayload ??
            (measurements.length > 0
                ? {
                    extractedMeasurements: measurements.map((measurement) => ({
                        markerName: measurement.markerName,
                        biomarkerId: measurement.biomarkerId ?? null,
                        value: measurement.value ?? null,
                        unit: measurement.unit ?? null,
                        referenceLow: measurement.referenceLow ?? null,
                        referenceHigh: measurement.referenceHigh ?? null,
                        capturedAt: measurement.capturedAt ?? null,
                        confidence: measurement.confidence ?? null
                    }))
                }
                : null);
        const status = measurements.length > 0 ? 'NORMALIZED' : 'PENDING';
        try {
            const upload = await this.prisma.panelUpload.create({
                data: {
                    userId,
                    storageKey: input.storageKey,
                    source: input.source ?? 'LAB_REPORT',
                    status,
                    contentType: input.contentType ?? null,
                    pageCount: input.pageCount ?? null,
                    rawMetadata: input.rawMetadata ? toJsonValue(input.rawMetadata) : client_1.Prisma.JsonNull,
                    normalizedPayload: normalizedPayload ? toJsonValue(normalizedPayload) : client_1.Prisma.JsonNull,
                    processedAt: measurements.length > 0 ? this.now() : null,
                    measurementCount: measurements.length
                }
            });
            if (measurements.length > 0) {
                await this.createMeasurements(upload.id, userId, measurements);
            }
            const withMeasurements = await this.prisma.panelUpload.findUnique({
                where: { id: upload.id },
                include: {
                    measurements: {
                        orderBy: { capturedAt: 'desc' }
                    }
                }
            });
            if (!withMeasurements) {
                throw new http_error_1.HttpError(500, 'Failed to hydrate panel upload.', 'PANEL_UPLOAD_FETCH_FAILED');
            }
            return withMeasurements;
        }
        catch (error) {
            throw this.wrapError(error);
        }
    }
    async listUploads(userId, limit = 12) {
        try {
            return await this.prisma.panelUpload.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: this.uploadInclude
            });
        }
        catch (error) {
            throw this.wrapError(error);
        }
    }
    async getUpload(userId, uploadId) {
        const upload = await this.prisma.panelUpload.findFirst({
            where: { id: uploadId, userId },
            include: this.uploadInclude
        });
        if (!upload) {
            throw new http_error_1.HttpError(404, 'Upload not found.', 'PANEL_UPLOAD_NOT_FOUND');
        }
        return upload;
    }
    async updateTags(userId, uploadId, input) {
        const upload = await this.getUpload(userId, uploadId);
        await this.prisma.$transaction(async (tx) => {
            if (input.planId !== undefined) {
                if (input.planId === null) {
                    await tx.panelUpload.update({
                        where: { id: upload.id },
                        data: { planId: null }
                    });
                }
                else {
                    const plan = await tx.longevityPlan.findFirst({
                        where: { id: input.planId, userId }
                    });
                    if (!plan) {
                        throw new http_error_1.HttpError(404, 'Plan not found.', 'PLAN_NOT_FOUND');
                    }
                    await tx.panelUpload.update({
                        where: { id: upload.id },
                        data: { planId: plan.id }
                    });
                }
            }
            if (input.biomarkerIds) {
                await tx.panelUploadBiomarkerTag.deleteMany({
                    where: { panelUploadId: upload.id }
                });
                if (input.biomarkerIds.length > 0) {
                    const biomarkerRecords = await tx.biomarker.findMany({
                        where: {
                            id: { in: input.biomarkerIds }
                        },
                        select: { id: true }
                    });
                    if (biomarkerRecords.length !== input.biomarkerIds.length) {
                        throw new http_error_1.HttpError(404, 'One or more biomarkers were not found.', 'BIOMARKER_NOT_FOUND');
                    }
                    await tx.panelUploadBiomarkerTag.createMany({
                        data: biomarkerRecords.map((biomarker) => ({
                            panelUploadId: upload.id,
                            biomarkerId: biomarker.id
                        }))
                    });
                }
            }
        });
        return this.getUpload(userId, uploadId);
    }
    async resolveDownloadUrl(userId, uploadId) {
        const upload = await this.getUpload(userId, uploadId);
        if (!upload.storageKey) {
            throw new http_error_1.HttpError(400, 'Upload is missing storage metadata.', 'PANEL_UPLOAD_STORAGE_KEY_MISSING');
        }
        const token = await this.createDownloadToken(userId, upload.id);
        return {
            url: `/ai/uploads/downloads/${token.token}`,
            expiresAt: token.expiresAt.toISOString()
        };
    }
    async redeemDownloadToken(userId, tokenValue) {
        const token = await this.prisma.panelUploadDownloadToken.findUnique({
            where: { token: tokenValue },
            include: {
                upload: true
            }
        });
        if (!token) {
            throw new http_error_1.HttpError(404, 'Download token not found', 'PANEL_DOWNLOAD_TOKEN_INVALID');
        }
        if (token.userId !== userId) {
            throw new http_error_1.HttpError(403, 'Download token does not belong to this user', 'PANEL_DOWNLOAD_TOKEN_FORBIDDEN');
        }
        if (token.usedAt) {
            throw new http_error_1.HttpError(410, 'Download token already used', 'PANEL_DOWNLOAD_TOKEN_USED');
        }
        if (token.expiresAt.getTime() <= this.now().getTime()) {
            throw new http_error_1.HttpError(410, 'Download token expired', 'PANEL_DOWNLOAD_TOKEN_EXPIRED');
        }
        if (!token.upload.storageKey) {
            throw new http_error_1.HttpError(400, 'Upload is missing storage metadata.', 'PANEL_UPLOAD_STORAGE_KEY_MISSING');
        }
        await this.prisma.panelUploadDownloadToken.update({
            where: { id: token.id },
            data: { usedAt: this.now() }
        });
        return {
            upload: token.upload,
            storageUrl: this.buildStorageUrl(token.upload.storageKey)
        };
    }
    async createMeasurements(uploadId, userId, measurements) {
        for (const measurement of measurements) {
            const capturedAt = typeof measurement.capturedAt === 'string'
                ? new Date(measurement.capturedAt)
                : measurement.capturedAt ?? this.now();
            await this.prisma.biomarkerMeasurement.create({
                data: {
                    userId,
                    biomarkerId: measurement.biomarkerId ?? null,
                    panelUploadId: uploadId,
                    markerName: measurement.markerName,
                    value: toDecimal(measurement.value),
                    unit: measurement.unit ?? null,
                    referenceLow: toDecimal(measurement.referenceLow),
                    referenceHigh: toDecimal(measurement.referenceHigh),
                    capturedAt,
                    status: client_1.MeasurementStatus.NORMALIZED,
                    source: measurement.source ?? client_1.BiomarkerSource.LAB_UPLOAD,
                    confidence: toDecimal(measurement.confidence),
                    flags: measurement.flags ? toJsonValue(measurement.flags) : client_1.Prisma.JsonNull
                }
            });
        }
    }
    wrapError(error) {
        if (error instanceof http_error_1.HttpError) {
            return error;
        }
        const message = error instanceof Error ? error.message : 'Unknown panel ingestion failure.';
        return new http_error_1.HttpError(500, message, 'PANEL_INGESTION_FAILED');
    }
    async createDownloadToken(userId, uploadId) {
        const expiresAt = new Date(this.now().getTime() + DOWNLOAD_TOKEN_TTL_MS);
        return this.prisma.panelUploadDownloadToken.create({
            data: {
                id: this.idFactory(),
                token: (0, node_crypto_1.randomUUID)(),
                userId,
                uploadId,
                expiresAt
            }
        });
    }
    buildStorageUrl(storageKey) {
        const baseUrl = env_1.default.PANEL_UPLOAD_DOWNLOAD_BASE_URL.replace(/\/+$/, '');
        const normalizedKey = storageKey.replace(/^\/+/, '');
        return `${baseUrl}/${normalizedKey}`;
    }
}
exports.PanelIngestionService = PanelIngestionService;
exports.panelIngestionService = new PanelIngestionService(prisma_1.default);
