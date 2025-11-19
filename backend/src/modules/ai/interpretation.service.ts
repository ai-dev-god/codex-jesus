import type { PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { labReportService } from '../lab-upload/lab-report.service';
import { HttpError } from '../observability-ops/http-error';
import { dualEngineInsightOrchestrator } from './dual-engine.service';
import env from '../../config/env';
import { baseLogger } from '../../observability/logger';

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
  private readonly logger = baseLogger.with({ component: 'ai-interpretation' });

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

    // Build context for AI interpretation
    const measurementsText = report.measurements
      .map((m) => {
        const valueStr = m.value !== null ? String(m.value) : '—';
        const unitStr = m.unit ? ` ${m.unit}` : '';
        const deltaStr = m.deltaPercentage !== null ? ` (Δ ${m.deltaPercentage}%)` : '';
        return `- ${m.markerName}: ${valueStr}${unitStr}${deltaStr}`;
      })
      .join('\n');

    const planContext = report.plan ? `Linked protocol: ${report.plan.title}` : 'No linked protocol';
    const bestPracticesContext =
      report.bestPractices.length > 0 ? `Current recommendations: ${report.bestPractices.join('; ')}` : '';

    // Use AI to generate interpretation if API key is available
    if (env.OPENROUTER_API_KEY) {
      try {
        const systemPrompt = `You are a medical AI assistant providing biomarker interpretation for longevity and health optimization.
Analyze the lab results and provide clinical insights.

Return strictly JSON with this exact structure:
{
  "title": "Brief title of the interpretation",
  "summary": "2-3 sentence summary highlighting key findings and trends",
  "body": {
    "insights": ["insight 1", "insight 2", ...],
    "recommendations": ["recommendation 1", "recommendation 2", ...]
  }
}`;

        const userPrompt = `Analyze these lab results:

${measurementsText}

${planContext}
${bestPracticesContext}

Provide a clinical interpretation focusing on:
- Significant changes from previous measurements (if delta percentages are shown)
- Values that may be outside optimal ranges
- Actionable steps to improve biomarker health
- Integration with the current protocol (if linked)

Return JSON only, no other text.`;

        const insight = await dualEngineInsightOrchestrator.generate({
          systemPrompt,
          userPrompt,
          temperature: 0.3,
          maxTokens: 1200
        });

        // Extract summary and recommendations from the dual-engine response
        // The dual-engine service returns a structured format with title, summary, and body
        const summary = insight.summary || insight.title || 'Lab results analyzed';
        const recommendations = insight.body.recommendations.length > 0
          ? insight.body.recommendations.slice(0, 5)
          : insight.body.insights.slice(0, 5).map((insight) => `Consider: ${insight}`);

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
      } catch (error) {
        this.logger.warn('AI interpretation failed, falling back to heuristics', {
          uploadId,
          error: error instanceof Error ? error.message : String(error)
        });
        // Fall through to heuristic-based interpretation
      }
    }

    // Fallback to heuristic-based interpretation
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

