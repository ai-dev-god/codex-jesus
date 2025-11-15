"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.longevityPlanQueue = exports.enqueueLongevityPlanTask = exports.LONGEVITY_PLAN_RETRY_CONFIG = exports.LONGEVITY_PLAN_QUEUE = void 0;
exports.LONGEVITY_PLAN_QUEUE = 'longevity-plan-generate';
exports.LONGEVITY_PLAN_RETRY_CONFIG = {
    maxAttempts: 5,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 600
};
const toJsonValue = (value) => JSON.parse(JSON.stringify(value));
const enqueueLongevityPlanTask = async (prisma, payload, options = {}) => {
    const taskName = options.taskName ?? `longevity-plan-${payload.userId}-${Date.now()}`;
    return prisma.cloudTaskMetadata.create({
        data: {
            taskName,
            queue: exports.LONGEVITY_PLAN_QUEUE,
            planJobId: payload.jobId,
            payload: toJsonValue({
                payload,
                retry: exports.LONGEVITY_PLAN_RETRY_CONFIG
            }),
            scheduleTime: options.scheduleTime ?? null,
            status: 'PENDING'
        }
    });
};
exports.enqueueLongevityPlanTask = enqueueLongevityPlanTask;
exports.longevityPlanQueue = {
    queue: exports.LONGEVITY_PLAN_QUEUE,
    retryConfig: exports.LONGEVITY_PLAN_RETRY_CONFIG,
    enqueue: (prisma, payload, options) => (0, exports.enqueueLongevityPlanTask)(prisma, payload, options)
};
