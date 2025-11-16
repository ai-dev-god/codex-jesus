"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labUploadIngestionWorker = exports.createLabUploadWorker = void 0;
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../lib/prisma"));
const logger_1 = require("../observability/logger");
const storage_1 = require("../lib/storage");
const env_1 = __importDefault(require("../config/env"));
const panel_ingest_service_1 = require("../modules/ai/panel-ingest.service");
const ingestion_supervisor_1 = require("../modules/lab-upload/ingestion-supervisor");
const lab_upload_crypto_1 = require("../modules/lab-upload/lab-upload-crypto");
const plan_link_service_1 = require("../modules/lab-upload/plan-link.service");
const bufferToText = (buffer, contentType) => {
    if (!contentType) {
        return buffer.toString('utf8');
    }
    if (contentType.includes('json') || contentType.includes('csv') || contentType.startsWith('text/')) {
        return buffer.toString('utf8');
    }
    return buffer.toString('latin1');
};
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
            const upload = await prisma.panelUpload.findFirst({
                where: { id: parsed.uploadId, userId: parsed.userId }
            });
            if (!upload) {
                throw new Error(`Upload ${parsed.uploadId} not found for user ${parsed.userId}`);
            }
            const [buffer] = await storage_1.labUploadBucket.file(upload.storageKey).download();
            const computedHash = (0, crypto_1.createHash)('sha256').update(buffer).digest('hex');
            if (upload.sha256Hash && upload.sha256Hash !== computedHash) {
                await panel_ingest_service_1.panelIngestionService.applyAutomatedIngestion(parsed.userId, parsed.uploadId, {
                    measurements: [],
                    normalizedPayload: {
                        integrityFailure: true,
                        expectedSha256: upload.sha256Hash,
                        receivedSha256: computedHash
                    },
                    error: {
                        code: 'INGESTION_INTEGRITY_MISMATCH',
                        message: 'Uploaded file hash does not match expected value.'
                    }
                });
                throw new Error('Integrity verification failed');
            }
            const sealed = (0, lab_upload_crypto_1.sealLabPayload)(buffer);
            const sealedKey = `sealed/${upload.userId}/${upload.id}-${Date.now()}.sealed`;
            const saveOptions = {
                resumable: false,
                contentType: 'application/octet-stream',
                metadata: {
                    'x-biohax-seal-iv': sealed.iv,
                    'x-biohax-seal-tag': sealed.authTag,
                    'x-biohax-seal-alg': sealed.algorithm
                }
            };
            if (env_1.default.LAB_UPLOAD_KMS_KEY_NAME) {
                saveOptions.kmsKeyName = env_1.default.LAB_UPLOAD_KMS_KEY_NAME;
            }
            await storage_1.labUploadBucket.file(sealedKey).save(sealed.ciphertext, saveOptions);
            const textPayload = bufferToText(buffer, upload.contentType);
            const ingestion = await ingestion_supervisor_1.labIngestionSupervisor.supervise(textPayload, {
                rawMetadata: upload.rawMetadata,
                contentType: upload.contentType
            });
            const normalizedPayload = {
                source: 'AI_SUPERVISED_V1',
                ingestionSummary: ingestion.summary,
                supervisorNotes: ingestion.notes,
                extractedMeasurements: ingestion.measurements.map((measurement) => ({
                    markerName: measurement.markerName,
                    biomarkerId: measurement.biomarkerId ?? null,
                    value: measurement.value ?? null,
                    unit: measurement.unit ?? null,
                    confidence: measurement.confidence ?? null,
                    flags: measurement.flags ?? null
                }))
            };
            await panel_ingest_service_1.panelIngestionService.applyAutomatedIngestion(parsed.userId, parsed.uploadId, {
                measurements: ingestion.measurements,
                normalizedPayload,
                sealedStorageKey: sealedKey,
                sealedKeyVersion: 'lab-seal-v1',
                error: null
            });
            await plan_link_service_1.labPlanLinkService.autoLink(parsed.uploadId, parsed.userId, ingestion.measurements);
            await prisma.cloudTaskMetadata.update({
                where: { id: metadata.id },
                data: {
                    status: 'COMPLETED',
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
