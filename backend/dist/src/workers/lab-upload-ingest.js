"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labUploadIngestionWorker = exports.createLabUploadWorker = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const logger_1 = require("../observability/logger");
const env_1 = __importDefault(require("../config/env"));
const panel_ingest_service_1 = require("../modules/ai/panel-ingest.service");
const ingestion_processor_1 = require("../modules/lab-upload/ingestion-processor");
const parseTaskPayload = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const record = payload;
    const uploadId = typeof record.uploadId === 'string' ? record.uploadId : null;
    const userId = typeof record.userId === 'string' ? record.userId : null;
    if (!uploadId || !userId) {
        return null;
    }
    return { uploadId, userId };
};
const createLabUploadWorker = (deps = {}) => {
    const prisma = deps.prisma ?? prisma_1.default;
    const logger = deps.logger ??
        logger_1.baseLogger.with({
            component: 'lab-upload-ingest',
            defaultFields: { worker: 'lab-upload-ingest' }
        });
    const now = deps.now ?? (() => new Date());
    const panelIngestion = deps.panelIngestion ?? panel_ingest_service_1.panelIngestionService;
    return async (taskName) => {
        const metadata = await prisma.cloudTaskMetadata.findUnique({ where: { taskName } });
        if (!metadata) {
            logger.warn('Lab upload worker received unknown task', { taskName });
            return;
        }
        const rawPayload = (metadata.payload ?? {});
        const parsed = parseTaskPayload(rawPayload.payload) ?? parseTaskPayload(rawPayload);
        if (!parsed) {
            logger.error('Lab upload worker missing payload identifiers', { taskName, payload: metadata.payload });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'FAILED',
                    errorMessage: 'Task payload missing uploadId or userId.',
                    attemptCount: metadata.attemptCount + 1,
                    firstAttemptAt: metadata.firstAttemptAt ?? now(),
                    lastAttemptAt: now()
                }
            });
            return;
        }
        try {
            await (0, ingestion_processor_1.runLabUploadIngestion)(parsed.uploadId, parsed.userId, {
                prisma,
                logger,
                now,
                envConfig: env_1.default,
                panelIngestion
            });
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
            logger.info('Lab upload ingestion completed', { taskName, uploadId: parsed.uploadId });
        }
        catch (error) {
            logger.error('Lab upload ingestion failed', {
                taskName,
                error: error instanceof Error ? error.message : error
            });
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'FAILED',
                    errorMessage: error instanceof Error ? error.message : String(error),
                    attemptCount: metadata.attemptCount + 1,
                    firstAttemptAt: metadata.firstAttemptAt ?? now(),
                    lastAttemptAt: now()
                }
            });
            throw error;
        }
    };
};
exports.createLabUploadWorker = createLabUploadWorker;
exports.labUploadIngestionWorker = (0, exports.createLabUploadWorker)();
