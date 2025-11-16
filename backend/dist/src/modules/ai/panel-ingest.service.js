"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.panelIngestionService = exports.PanelIngestionService = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const storage_1 = require("../../lib/storage");
const env_1 = __importDefault(require("../../config/env"));
const logger_1 = require("../../observability/logger");
const ingestion_queue_1 = require("../lab-upload/ingestion-queue");
const toDecimal = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    return new client_1.Prisma.Decimal(value);
};
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
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
        this.logger = logger_1.baseLogger.with({ component: 'panel-ingestion-service' });
        this.now = options.now ?? (() => new Date());
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
            const uploadId = await this.prisma.$transaction(async (tx) => {
                const session = await tx.panelUploadSession.findFirst({
                    where: {
                        id: input.sessionId,
                        userId
                    }
                });
                if (!session) {
                    throw new http_error_1.HttpError(404, 'Upload session not found.', 'PANEL_UPLOAD_SESSION_NOT_FOUND');
                }
                if (session.storageKey !== input.storageKey) {
                    throw new http_error_1.HttpError(409, 'Upload session does not match storage key.', 'PANEL_UPLOAD_SESSION_MISMATCH');
                }
                const now = this.now();
                if (session.status === 'USED') {
                    throw new http_error_1.HttpError(409, 'Upload session already used.', 'PANEL_UPLOAD_SESSION_USED');
                }
                if (session.status === 'EXPIRED' || session.expiresAt < now) {
                    await tx.panelUploadSession.update({
                        where: { id: session.id },
                        data: { status: 'EXPIRED' }
                    });
                    throw new http_error_1.HttpError(410, 'Upload session expired.', 'PANEL_UPLOAD_SESSION_EXPIRED');
                }
                const upload = await tx.panelUpload.create({
                    data: {
                        userId,
                        storageKey: session.storageKey,
                        source: input.source ?? 'LAB_REPORT',
                        status,
                        contentType: session.contentType,
                        byteSize: session.byteSize,
                        sha256Hash: session.sha256Hash,
                        pageCount: input.pageCount ?? null,
                        rawMetadata: input.rawMetadata ? toJsonValue(input.rawMetadata) : client_1.Prisma.JsonNull,
                        normalizedPayload: normalizedPayload ? toJsonValue(normalizedPayload) : client_1.Prisma.JsonNull,
                        processedAt: measurements.length > 0 ? now : null,
                        measurementCount: measurements.length,
                        uploadSessionId: session.id
                    }
                });
                if (measurements.length > 0) {
                    await this.createMeasurements(tx, upload.id, userId, measurements);
                }
                await tx.panelUploadSession.update({
                    where: { id: session.id },
                    data: {
                        status: 'USED',
                        usedAt: now
                    }
                });
                return upload.id;
            });
            const withMeasurements = await this.prisma.panelUpload.findUnique({
                where: { id: uploadId },
                include: {
                    measurements: {
                        orderBy: { capturedAt: 'desc' }
                    }
                }
            });
            if (!withMeasurements) {
                throw new http_error_1.HttpError(500, 'Failed to hydrate panel upload.', 'PANEL_UPLOAD_FETCH_FAILED');
            }
            try {
                await ingestion_queue_1.labUploadQueue.enqueue(this.prisma, { uploadId: withMeasurements.id, userId });
            }
            catch (enqueueError) {
                this.logger.error('Failed to enqueue lab ingestion task', {
                    uploadId: withMeasurements.id,
                    userId,
                    error: enqueueError instanceof Error ? enqueueError.message : enqueueError
                });
                throw new http_error_1.HttpError(503, 'Unable to schedule lab ingestion.', 'PANEL_UPLOAD_QUEUE_FAILED');
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
            throw new http_error_1.HttpError(400, 'Upload is missing an origin object.', 'PANEL_UPLOAD_STORAGE_MISSING');
        }
        const expiresAt = new Date(this.now().getTime() + env_1.default.LAB_UPLOAD_DOWNLOAD_TTL_SECONDS * 1000);
        const file = storage_1.labUploadBucket.file(upload.storageKey);
        try {
            const [signedUrl] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: expiresAt
            });
            const rawToken = (0, crypto_1.randomBytes)(32).toString('base64url');
            const tokenHash = (0, crypto_1.createHash)('sha256').update(rawToken).digest('hex');
            const tokenRecord = await this.prisma.panelUploadDownloadToken.create({
                data: {
                    token: tokenHash,
                    userId,
                    uploadId: upload.id,
                    expiresAt,
                    usedAt: this.now()
                }
            });
            this.logger.info('panel-upload-download-issued', {
                userId,
                uploadId: upload.id,
                downloadTokenId: tokenRecord.id,
                expiresAt: expiresAt.toISOString()
            });
            return {
                url: signedUrl,
                expiresAt: expiresAt.toISOString(),
                token: rawToken
            };
        }
        catch (error) {
            this.logger.error('Failed to create download URL', {
                userId,
                uploadId,
                error: error instanceof Error ? error.message : error
            });
            throw new http_error_1.HttpError(502, 'Unable to generate download link.', 'PANEL_DOWNLOAD_FAILED');
        }
    }
    async createMeasurements(client, uploadId, userId, measurements) {
        for (const measurement of measurements) {
            const capturedAt = typeof measurement.capturedAt === 'string'
                ? new Date(measurement.capturedAt)
                : measurement.capturedAt ?? this.now();
            await client.biomarkerMeasurement.create({
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
    async applyAutomatedIngestion(userId, uploadId, input) {
        try {
            await this.prisma.$transaction(async (tx) => {
                const upload = await tx.panelUpload.findFirst({
                    where: { id: uploadId, userId }
                });
                if (!upload) {
                    throw new http_error_1.HttpError(404, 'Upload not found.', 'PANEL_UPLOAD_NOT_FOUND');
                }
                await tx.biomarkerMeasurement.deleteMany({
                    where: { panelUploadId: uploadId }
                });
                if (input.measurements.length > 0) {
                    await this.createMeasurements(tx, uploadId, userId, input.measurements);
                }
                const hasMeasurements = input.measurements.length > 0;
                const data = {
                    measurementCount: input.measurements.length,
                    processedAt: this.now(),
                    normalizedPayload: input.normalizedPayload ? toJsonValue(input.normalizedPayload) : client_1.Prisma.JsonNull,
                    sealedStorageKey: input.sealedStorageKey ?? upload.sealedStorageKey,
                    sealedKeyVersion: input.sealedKeyVersion ?? upload.sealedKeyVersion
                };
                if (input.error) {
                    data.status = 'FAILED';
                    data.errorCode = input.error.code;
                    data.errorMessage = input.error.message;
                }
                else if (hasMeasurements) {
                    data.status = 'NORMALIZED';
                    data.errorCode = null;
                    data.errorMessage = null;
                }
                else {
                    data.status = 'FAILED';
                    data.errorCode = 'INGESTION_EMPTY';
                    data.errorMessage = 'Ingestion completed but no biomarkers were extracted.';
                }
                await tx.panelUpload.update({
                    where: { id: uploadId },
                    data
                });
            });
            return this.getUpload(userId, uploadId);
        }
        catch (error) {
            throw this.wrapError(error);
        }
    }
}
exports.PanelIngestionService = PanelIngestionService;
exports.panelIngestionService = new PanelIngestionService(prisma_1.default);
