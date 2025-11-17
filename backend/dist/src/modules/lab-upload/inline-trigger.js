"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeProcessLabUploadInline = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const env_1 = __importDefault(require("../../config/env"));
const logger_1 = require("../../observability/logger");
const ingestion_queue_1 = require("./ingestion-queue");
const ingestion_processor_1 = require("./ingestion-processor");
const maybeProcessLabUploadInline = async (uploadId, userId, deps) => {
    const enabled = deps.enabled ?? env_1.default.LAB_UPLOAD_INLINE_INGEST;
    if (!enabled) {
        return;
    }
    const prisma = deps.prisma ?? prisma_1.default;
    const logger = deps.logger ??
        logger_1.baseLogger.with({
            component: 'lab-upload-inline',
            defaultFields: { worker: 'lab-upload-inline' }
        });
    const now = deps.now ?? (() => new Date());
    try {
        await (0, ingestion_processor_1.runLabUploadIngestion)(uploadId, userId, {
            prisma,
            logger,
            now,
            panelIngestion: deps.panelIngestion
        });
    }
    catch (error) {
        logger.error('Inline lab ingestion failed', {
            uploadId,
            userId,
            error: error instanceof Error ? error.message : error
        });
        return;
    }
    try {
        const metadata = await prisma.cloudTaskMetadata.findFirst({
            where: {
                queue: ingestion_queue_1.LAB_UPLOAD_QUEUE,
                payload: {
                    path: ['payload', 'uploadId'],
                    equals: uploadId
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        if (!metadata) {
            return;
        }
        await prisma.cloudTaskMetadata.update({
            where: { id: metadata.id },
            data: {
                status: 'SUCCEEDED',
                errorMessage: null,
                attemptCount: metadata.attemptCount + 1,
                firstAttemptAt: metadata.firstAttemptAt ?? now(),
                lastAttemptAt: now()
            }
        });
    }
    catch (error) {
        logger.warn('Unable to mark inline ingestion task as completed', {
            uploadId,
            userId,
            error: error instanceof Error ? error.message : error
        });
    }
};
exports.maybeProcessLabUploadInline = maybeProcessLabUploadInline;
