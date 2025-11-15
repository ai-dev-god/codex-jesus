import {
  Prisma,
  BiomarkerLog,
  BiomarkerMeasurement,
  DataDeletionJob,
  DataExportJob,
  Insight,
  LongevityPlan,
  PanelUpload,
  type PrismaClient
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';

const EXPORT_RETENTION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export type DataExportPayload = {
  user: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  biomarkerLogs: BiomarkerLog[];
  biomarkerMeasurements: BiomarkerMeasurement[];
  panelUploads: PanelUpload[];
  longevityPlans: LongevityPlan[];
  insights: Insight[];
};

type ExportJobProjection = Pick<
  DataExportJob,
  'id' | 'status' | 'requestedAt' | 'processedAt' | 'completedAt' | 'expiresAt' | 'errorMessage' | 'result'
>;

type DeletionJobProjection = Pick<
  DataDeletionJob,
  'id' | 'status' | 'requestedAt' | 'processedAt' | 'completedAt' | 'deletedSummary' | 'errorMessage'
>;

export class DataSubjectService {
  constructor(
    private readonly prisma: PrismaClient = prismaClient,
    private readonly idFactory: () => string = () => randomUUID(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async requestExport(userId: string): Promise<ExportJobProjection> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const job = await this.prisma.dataExportJob.create({
      data: {
        id: this.idFactory(),
        userId
      }
    });

    return this.processExportJob(job.id);
  }

  async getExportJob(userId: string, jobId: string): Promise<ExportJobProjection> {
    const job = await this.prisma.dataExportJob.findFirst({
      where: { id: jobId, userId }
    });

    if (!job) {
      throw new HttpError(404, 'Export request not found', 'DATA_EXPORT_NOT_FOUND');
    }

    return job;
  }

  async requestDeletion(userId: string): Promise<DeletionJobProjection> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const job = await this.prisma.dataDeletionJob.create({
      data: {
        id: this.idFactory(),
        userId
      }
    });

    return this.processDeletionJob(job.id);
  }

  async getDeletionJob(userId: string, jobId: string): Promise<DeletionJobProjection> {
    const job = await this.prisma.dataDeletionJob.findFirst({
      where: { id: jobId, userId }
    });

    if (!job) {
      throw new HttpError(404, 'Deletion request not found', 'DATA_DELETION_NOT_FOUND');
    }

    return job;
  }

  async getLatestExportJob(userId: string): Promise<ExportJobProjection | null> {
    const job = await this.prisma.dataExportJob.findFirst({
      where: { userId },
      orderBy: { requestedAt: 'desc' }
    });
    return job ?? null;
  }

  async getLatestDeletionJob(userId: string): Promise<DeletionJobProjection | null> {
    const job = await this.prisma.dataDeletionJob.findFirst({
      where: { userId },
      orderBy: { requestedAt: 'desc' }
    });
    return job ?? null;
  }

  private async processExportJob(jobId: string): Promise<ExportJobProjection> {
    const job = await this.prisma.dataExportJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new HttpError(404, 'Export job missing', 'DATA_EXPORT_NOT_FOUND');
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
    } catch (error) {
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

  private async processDeletionJob(jobId: string): Promise<DeletionJobProjection> {
    const job = await this.prisma.dataDeletionJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new HttpError(404, 'Deletion job missing', 'DATA_DELETION_NOT_FOUND');
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
    } catch (error) {
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

  private async collectUserSnapshot(userId: string): Promise<DataExportPayload> {
    const [user, profile, biomarkerLogs, biomarkerMeasurements, panelUploads, longevityPlans, insights] =
      await Promise.all([
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
        this.prisma.insight.findMany({ where: { userId } })
      ]);

    return {
      user: user ? JSON.parse(JSON.stringify(user)) : null,
      profile: profile ? JSON.parse(JSON.stringify(profile)) : null,
      biomarkerLogs,
      biomarkerMeasurements,
      panelUploads,
      longevityPlans,
      insights
    };
  }

  private async scrubUserData(userId: string): Promise<Record<string, number>> {
    const now = this.now();
    return await this.prisma.$transaction(async (tx) => {
      const summary: Record<string, number> = {};

      const tally = async (label: string, promise: Promise<{ count: number }>) => {
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
      await tally('loginAudits', tx.loginAudit.deleteMany({ where: { userId } }));

      await tx.profile.updateMany({
        where: { userId },
        data: {
          displayName: 'Deleted Member',
          baselineSurvey: Prisma.JsonNull,
          consents: Prisma.JsonNull,
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

export const dataSubjectService = new DataSubjectService();

