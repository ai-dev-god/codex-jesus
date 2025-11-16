"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const prisma_1 = __importDefault(require("../lib/prisma"));
const logger_1 = require("../observability/logger");
const notify_1 = require("./notify");
const insights_generate_1 = require("./insights-generate");
const whoop_sync_1 = require("./whoop-sync");
const longevity_plan_1 = require("./longevity-plan");
const lab_upload_ingest_1 = require("./lab-upload-ingest");
const logger = logger_1.baseLogger.with({ component: 'worker-runner' });
const prisma = prisma_1.default;
const WORKER_REGISTRY = {
    'insights-generate': insights_generate_1.insightsGenerateWorker,
    'whoop-sync': whoop_sync_1.whoopSyncWorker,
    'notifications-dispatch': notify_1.notificationWorker,
    'longevity-plan-generate': longevity_plan_1.longevityPlanWorker,
    'lab-upload-ingest': lab_upload_ingest_1.labUploadIngestionWorker
};
const parseQueueList = () => {
    const configured = process.env.WORKER_QUEUES;
    const queues = configured
        ? configured
            .split(',')
            .map((queue) => queue.trim())
            .filter(Boolean)
        : Object.keys(WORKER_REGISTRY);
    const validQueues = queues.filter((queue) => {
        if (!WORKER_REGISTRY[queue]) {
            logger.warn('Ignoring unknown worker queue', { queue });
            return false;
        }
        return true;
    });
    if (validQueues.length === 0) {
        logger.warn('No worker queues enabled; exiting.');
        process.exit(0);
    }
    return validQueues;
};
const WORKER_QUEUES = parseQueueList();
const POLL_INTERVAL_MS = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? '5000', 10);
const ERROR_BACKOFF_MS = Number.parseInt(process.env.WORKER_ERROR_BACKOFF_MS ?? '2000', 10);
let shuttingDown = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const claimNextTask = async (queue) => {
    const now = new Date();
    try {
        const result = await prisma.$transaction(async (tx) => {
            const task = await tx.cloudTaskMetadata.findFirst({
                where: {
                    queue,
                    status: 'PENDING',
                    OR: [{ scheduleTime: null }, { scheduleTime: { lte: now } }]
                },
                orderBy: [{ scheduleTime: 'asc' }, { createdAt: 'asc' }]
            });
            if (!task) {
                return null;
            }
            await tx.cloudTaskMetadata.update({
                where: { id: task.id },
                data: {
                    status: 'DISPATCHED'
                }
            });
            return task;
        }, { maxWait: 5_000, timeout: 10_000 });
        return result;
    }
    catch (error) {
        logger.error('Failed to claim task', {
            queue,
            error: error instanceof Error ? error.message : error
        });
        return null;
    }
};
const markRunnerFailure = async (task, error) => {
    const now = new Date();
    try {
        await prisma.cloudTaskMetadata.update({
            where: { id: task.id },
            data: {
                status: 'FAILED',
                attemptCount: task.attemptCount + 1,
                firstAttemptAt: task.firstAttemptAt ?? now,
                lastAttemptAt: now,
                errorMessage: error instanceof Error ? error.message : String(error ?? 'Worker runner failure')
            }
        });
    }
    catch (updateError) {
        logger.error('Unable to record worker failure', {
            taskName: task.taskName,
            queue: task.queue,
            error: updateError instanceof Error ? updateError.message : updateError
        });
    }
};
const processQueue = async (queue) => {
    const handler = WORKER_REGISTRY[queue];
    if (!handler) {
        return;
    }
    logger.info('Worker loop started', { queue });
    while (!shuttingDown) {
        const task = await claimNextTask(queue);
        if (!task) {
            await sleep(POLL_INTERVAL_MS);
            continue;
        }
        logger.info('Dispatching task', { queue, taskName: task.taskName });
        try {
            await handler(task.taskName);
        }
        catch (error) {
            logger.error('Worker handler threw uncaught error', {
                queue,
                taskName: task.taskName,
                error: error instanceof Error ? error.message : error
            });
            await markRunnerFailure(task, error);
            await sleep(ERROR_BACKOFF_MS);
        }
    }
    logger.info('Worker loop stopping', { queue });
};
const shutdown = async () => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    logger.info('Shutting down worker runner...');
    await prisma.$disconnect();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
const main = async () => {
    logger.info('Starting background worker runner', { queues: WORKER_QUEUES });
    await Promise.all(WORKER_QUEUES.map((queue) => processQueue(queue)));
};
void main().catch(async (error) => {
    logger.error('Worker runner failed to start', {
        error: error instanceof Error ? error.message : error
    });
    await shutdown();
    process.exit(1);
});
