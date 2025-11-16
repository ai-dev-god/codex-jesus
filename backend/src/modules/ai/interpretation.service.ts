import type { PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { labReportService } from '../lab-upload/lab-report.service';
import { HttpError } from '../observability-ops/http-error';

export type AiInterpretation = {
  uploadId: string;
  generatedAt: string;
  summary: string;
  recommendations: string[];
  citation: {
    label: string;
    reportUrl: string;
  };
};

export class AiInterpretationService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  async generate(userId: string, uploadId: string): Promise<AiInterpretation> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { aiInterpretationApprovedAt: true }
    });

    if (!profile?.aiInterpretationApprovedAt) {
      throw new HttpError(403, 'Practitioner approval is required before viewing AI interpretations.', 'AI_INTERPRETATION_REQUIRES_APPROVAL');
    }

    const report = await labReportService.buildReport(userId, uploadId);
    const focusMeasurement = report.measurements.find((measurement) => measurement.deltaPercentage !== null);
    const summary = focusMeasurement
      ? `${focusMeasurement.markerName} shifted ${focusMeasurement.deltaPercentage}% compared to the prior panel. Continue the linked ${report.plan?.title ?? 'protocol'} and retest within 4 weeks.`
      : 'No significant biomarker movement detected since the prior panel. Continue adherence and retest next month.';

    const recommendations =
      report.bestPractices.length > 0
        ? report.bestPractices.slice(0, 3)
        : ['Maintain your current protocol cadence and keep sleep + recovery windows consistent.'];

    return {
      uploadId,
      generatedAt: new Date().toISOString(),
      summary,
      recommendations,
      citation: {
        label: report.upload.fileName ?? report.upload.id,
        reportUrl: `/reports/labs/${uploadId}?format=pdf`
      }
    };
  }
}

export const aiInterpretationService = new AiInterpretationService();

