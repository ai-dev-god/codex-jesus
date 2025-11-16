"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labUploadQueue = exports.enqueueLabUploadIngestionTask = exports.LAB_UPLOAD_RETRY_CONFIG = exports.LAB_UPLOAD_QUEUE = void 0;
exports.LAB_UPLOAD_QUEUE = 'lab-upload-ingest';
exports.LAB_UPLOAD_RETRY_CONFIG = {
    maxAttempts: 5,
    minBackoffSeconds: 45,
    maxBackoffSeconds: 600
};
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const enqueueLabUploadIngestionTask = async (prisma, payload, options = {}) => {
    const taskName = options.taskName ?? `lab-upload-${payload.uploadId}-${Date.now()}`;
    return prisma.cloudTaskMetadata.create({
        data: {
            taskName,
            queue: exports.LAB_UPLOAD_QUEUE,
            payload: toJsonValue({
                payload,
                retry: exports.LAB_UPLOAD_RETRY_CONFIG
            }),
            scheduleTime: options.scheduleTime ?? null,
            status: 'PENDING'
        }
    });
};
exports.enqueueLabUploadIngestionTask = enqueueLabUploadIngestionTask;
exports.labUploadQueue = {
    queue: exports.LAB_UPLOAD_QUEUE,
    retryConfig: exports.LAB_UPLOAD_RETRY_CONFIG,
    enqueue: (prisma, payload, options) => (0, exports.enqueueLabUploadIngestionTask)(prisma, payload, options)
};
