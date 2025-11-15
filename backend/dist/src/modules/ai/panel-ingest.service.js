"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.panelIngestionService = exports.PanelIngestionService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
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
}
exports.PanelIngestionService = PanelIngestionService;
exports.panelIngestionService = new PanelIngestionService(prisma_1.default);
