"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLabUploadIngestion = void 0;
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const storage_1 = require("../../lib/storage");
const env_1 = __importDefault(require("../../config/env"));
const logger_1 = require("../../observability/logger");
const ingestion_supervisor_1 = require("./ingestion-supervisor");
const lab_upload_crypto_1 = require("./lab-upload-crypto");
const plan_link_service_1 = require("./plan-link.service");
const bufferToText = (buffer, contentType) => {
    if (!contentType) {
        return buffer.toString('utf8');
    }
    if (contentType.includes('json') || contentType.includes('csv') || contentType.startsWith('text/')) {
        return buffer.toString('utf8');
    }
    return buffer.toString('latin1');
};
const buildNormalizedPayload = (ingestion) => ({
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
});
const runLabUploadIngestion = async (uploadId, userId, deps) => {
    const prisma = deps.prisma ?? prisma_1.default;
    const logger = deps.logger ?? logger_1.baseLogger.with({ component: 'lab-upload-ingestion' });
    const bucket = deps.bucket ?? storage_1.labUploadBucket;
    const now = deps.now ?? (() => new Date());
    const envConfig = deps.envConfig ?? env_1.default;
    const supervisor = deps.supervisor ?? ingestion_supervisor_1.labIngestionSupervisor;
    const sealPayload = deps.sealPayload ?? lab_upload_crypto_1.sealLabPayload;
    const planLink = deps.planLinkService ?? plan_link_service_1.labPlanLinkService;
    const panelIngestion = deps.panelIngestion;
    if (!panelIngestion) {
        throw new Error('panelIngestion dependency is required for lab upload ingestion.');
    }
    const upload = await prisma.panelUpload.findFirst({
        where: { id: uploadId, userId }
    });
    if (!upload) {
        throw new Error(`Upload ${uploadId} not found for user ${userId}`);
    }
    const fileHandle = bucket.file(upload.storageKey);
    const [buffer] = await fileHandle.download();
    const computedHash = (0, crypto_1.createHash)('sha256').update(buffer).digest('hex');
    if (upload.sha256Hash && upload.sha256Hash !== computedHash) {
        await panelIngestion.applyAutomatedIngestion(userId, uploadId, {
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
    const sealed = sealPayload(buffer);
    const sealedKey = `sealed/${upload.userId}/${upload.id}-${now().getTime()}.sealed`;
    const saveOptions = {
        resumable: false,
        contentType: 'application/octet-stream',
        metadata: {
            'x-biohax-seal-iv': sealed.iv,
            'x-biohax-seal-tag': sealed.authTag,
            'x-biohax-seal-alg': sealed.algorithm
        }
    };
    if (envConfig.LAB_UPLOAD_KMS_KEY_NAME) {
        saveOptions.kmsKeyName = envConfig.LAB_UPLOAD_KMS_KEY_NAME;
    }
    await bucket.file(sealedKey).save(sealed.ciphertext, saveOptions);
    const textPayload = bufferToText(buffer, upload.contentType);
    const ingestion = await supervisor.supervise(textPayload, {
        rawMetadata: upload.rawMetadata ?? null,
        contentType: upload.contentType
    });
    const normalizedPayload = buildNormalizedPayload(ingestion);
    await panelIngestion.applyAutomatedIngestion(userId, uploadId, {
        measurements: ingestion.measurements,
        normalizedPayload,
        sealedStorageKey: sealedKey,
        sealedKeyVersion: 'lab-seal-v1',
        error: null
    });
    try {
        await planLink.autoLink(uploadId, userId, ingestion.measurements);
    }
    catch (error) {
        logger.warn('Lab plan auto-linking failed', {
            uploadId,
            userId,
            error: error instanceof Error ? error.message : error
        });
    }
    return {
        measurementCount: ingestion.measurements.length,
        sealedStorageKey: sealedKey
    };
};
exports.runLabUploadIngestion = runLabUploadIngestion;
