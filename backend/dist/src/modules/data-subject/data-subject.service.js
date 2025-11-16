"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataSubjectService = exports.DataSubjectService = void 0;
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const EXPORT_RETENTION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const toJson = (value) => JSON.parse(JSON.stringify(value));
class DataSubjectService {
    constructor(prisma = prisma_1.default, idFactory = () => (0, node_crypto_1.randomUUID)(), now = () => new Date()) {
        this.prisma = prisma;
        this.idFactory = idFactory;
        this.now = now;
    }
    async requestExport(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new http_error_1.HttpError(404, 'User not found', 'USER_NOT_FOUND');
        }
        const job = await this.prisma.dataExportJob.create({
            data: {
                id: this.idFactory(),
                userId
            }
        });
        return this.processExportJob(job.id);
    }
    async getExportJob(userId, jobId) {
        const job = await this.prisma.dataExportJob.findFirst({
            where: { id: jobId, userId }
        });
        if (!job) {
            throw new http_error_1.HttpError(404, 'Export request not found', 'DATA_EXPORT_NOT_FOUND');
        }
        return job;
    }
    async requestDeletion(userId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new http_error_1.HttpError(404, 'User not found', 'USER_NOT_FOUND');
        }
        const job = await this.prisma.dataDeletionJob.create({
            data: {
                id: this.idFactory(),
                userId
            }
        });
        return this.processDeletionJob(job.id);
    }
    async getDeletionJob(userId, jobId) {
        const job = await this.prisma.dataDeletionJob.findFirst({
            where: { id: jobId, userId }
        });
        if (!job) {
            throw new http_error_1.HttpError(404, 'Deletion request not found', 'DATA_DELETION_NOT_FOUND');
        }
        return job;
    }
    async getLatestExportJob(userId) {
        const job = await this.prisma.dataExportJob.findFirst({
            where: { userId },
            orderBy: { requestedAt: 'desc' }
        });
        return job ?? null;
    }
    async getLatestDeletionJob(userId) {
        const job = await this.prisma.dataDeletionJob.findFirst({
            where: { userId },
            orderBy: { requestedAt: 'desc' }
        });
        return job ?? null;
    }
    async processExportJob(jobId) {
        const job = await this.prisma.dataExportJob.findUnique({ where: { id: jobId } });
        if (!job) {
            throw new http_error_1.HttpError(404, 'Export job missing', 'DATA_EXPORT_NOT_FOUND');
        }
        const startedAt = this.now();
        await this.prisma.dataExportJob.update({
            where: { id: jobId },
            data: {
                status: 'IN_PROGRESS',
                processedAt: startedAt
            }
        });
        try {
            const payload = await this.collectUserSnapshot(job.userId);
            const completedAt = this.now();
            const expiresAt = new Date(completedAt.getTime() + EXPORT_RETENTION_MS);
            return await this.prisma.dataExportJob.update({
                where: { id: jobId },
                data: {
                    status: 'COMPLETE',
                    result: toJson({
                        generatedAt: completedAt.toISOString(),
                        data: payload
                    }),
                    completedAt,
                    expiresAt
                }
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to assemble export payload';
            return await this.prisma.dataExportJob.update({
                where: { id: jobId },
                data: {
                    status: 'FAILED',
                    errorMessage: message
                }
            });
        }
    }
    async processDeletionJob(jobId) {
        const job = await this.prisma.dataDeletionJob.findUnique({ where: { id: jobId } });
        if (!job) {
            throw new http_error_1.HttpError(404, 'Deletion job missing', 'DATA_DELETION_NOT_FOUND');
        }
        const startedAt = this.now();
        await this.prisma.dataDeletionJob.update({
            where: { id: jobId },
            data: {
                status: 'IN_PROGRESS',
                processedAt: startedAt
            }
        });
        try {
            const summary = await this.scrubUserData(job.userId);
            const completedAt = this.now();
            return await this.prisma.dataDeletionJob.update({
                where: { id: jobId },
                data: {
                    status: 'COMPLETE',
                    deletedSummary: toJson(summary),
                    completedAt
                }
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete user data';
            return await this.prisma.dataDeletionJob.update({
                where: { id: jobId },
                data: {
                    status: 'FAILED',
                    errorMessage: message
                }
            });
        }
    }
    async collectUserSnapshot(userId) {
        const [user, profile, biomarkerLogs, biomarkerMeasurements, panelUploads, longevityPlans, insights, stravaIntegration, stravaActivities] = await Promise.all([
            this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    role: true,
                    status: true,
                    whoopMemberId: true,
                    createdAt: true,
                    updatedAt: true
                }
            }),
            this.prisma.profile.findUnique({ where: { userId } }),
            this.prisma.biomarkerLog.findMany({ where: { userId } }),
            this.prisma.biomarkerMeasurement.findMany({ where: { userId } }),
            this.prisma.panelUpload.findMany({
                where: { userId },
                include: {
                    biomarkerTags: true,
                    measurements: true
                }
            }),
            this.prisma.longevityPlan.findMany({ where: { userId } }),
            this.prisma.insight.findMany({ where: { userId } }),
            this.prisma.stravaIntegration.findUnique({ where: { userId } }),
            this.prisma.stravaActivity.findMany({ where: { userId } })
        ]);
        return {
            user: user ? JSON.parse(JSON.stringify(user)) : null,
            profile: profile ? JSON.parse(JSON.stringify(profile)) : null,
            biomarkerLogs,
            biomarkerMeasurements,
            panelUploads,
            longevityPlans,
            insights,
            stravaIntegration: stravaIntegration ? JSON.parse(JSON.stringify(stravaIntegration)) : null,
            stravaActivities
        };
    }
    async scrubUserData(userId) {
        const now = this.now();
        return await this.prisma.$transaction(async (tx) => {
            const summary = {};
            const tally = async (label, promise) => {
                const result = await promise;
                summary[label] = result.count;
            };
            await tally('biomarkerLogs', tx.biomarkerLog.deleteMany({ where: { userId } }));
            await tally('biomarkerMeasurements', tx.biomarkerMeasurement.deleteMany({ where: { userId } }));
            await tally('panelUploads', tx.panelUpload.deleteMany({ where: { userId } }));
            await tally('longevityPlans', tx.longevityPlan.deleteMany({ where: { userId } }));
            await tally('longevityPlanJobs', tx.longevityPlanJob.deleteMany({ where: { requestedById: userId } }));
            await tally('insights', tx.insight.deleteMany({ where: { userId } }));
            await tally('insightJobs', tx.insightGenerationJob.deleteMany({ where: { requestedById: userId } }));
            await tally('whoopIntegrations', tx.whoopIntegration.deleteMany({ where: { userId } }));
            await tally('whoopLinkSessions', tx.whoopLinkSession.deleteMany({ where: { userId } }));
            await tally('stravaActivities', tx.stravaActivity.deleteMany({ where: { userId } }));
            await tally('stravaIntegrations', tx.stravaIntegration.deleteMany({ where: { userId } }));
            await tally('stravaLinkSessions', tx.stravaLinkSession.deleteMany({ where: { userId } }));
            await tally('loginAudits', tx.loginAudit.deleteMany({ where: { userId } }));
            await tx.profile.updateMany({
                where: { userId },
                data: {
                    displayName: 'Deleted Member',
                    baselineSurvey: client_1.Prisma.JsonNull,
                    consents: client_1.Prisma.JsonNull,
                    deleteRequested: true,
                    deletedAt: now
                }
            });
            const anonymizedEmail = `deleted+${userId}@privacy.local`;
            await tx.user.update({
                where: { id: userId },
                data: {
                    email: anonymizedEmail,
                    fullName: null,
                    whoopMemberId: null,
                    status: 'SUSPENDED',
                    updatedAt: now
                }
            });
            return summary;
        });
    }
}
exports.DataSubjectService = DataSubjectService;
exports.dataSubjectService = new DataSubjectService();
