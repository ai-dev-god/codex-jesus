"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insightsQueue = exports.enqueueInsightGenerationTask = exports.INSIGHTS_GENERATE_RETRY_CONFIG = exports.INSIGHTS_GENERATE_QUEUE = void 0;
exports.INSIGHTS_GENERATE_QUEUE = 'insights-generate';
exports.INSIGHTS_GENERATE_RETRY_CONFIG = {
    maxAttempts: 5,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 900
};
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const enqueueInsightGenerationTask = async (prisma, payload, options = {}) => {
    const taskName = options.taskName ?? `insights-generate-${payload.userId}-${Date.now()}`;
    return prisma.cloudTaskMetadata.create({
        data: {
            taskName,
            queue: exports.INSIGHTS_GENERATE_QUEUE,
            jobId: payload.jobId,
            payload: toJsonValue({
                payload,
                retry: exports.INSIGHTS_GENERATE_RETRY_CONFIG
            }),
            scheduleTime: options.scheduleTime ?? null,
            status: 'PENDING'
        }
    });
};
exports.enqueueInsightGenerationTask = enqueueInsightGenerationTask;
exports.insightsQueue = {
    queue: exports.INSIGHTS_GENERATE_QUEUE,
    retryConfig: exports.INSIGHTS_GENERATE_RETRY_CONFIG,
    enqueue: (prisma, payload, options) => (0, exports.enqueueInsightGenerationTask)(prisma, payload, options)
};
