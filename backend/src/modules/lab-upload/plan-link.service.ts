import { Prisma, type LongevityPlan, type PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';

const FOCUS_MAP: Record<string, string[]> = {
  glucose: ['metabolic'],
  hba1c: ['metabolic'],
  insulin: ['metabolic'],
  triglycerides: ['cardiovascular'],
  cholesterol: ['cardiovascular'],
  ldl: ['cardiovascular'],
  hdl: ['cardiovascular'],
  apob: ['cardiovascular'],
  crp: ['inflammation'],
  homocysteine: ['inflammation'],
  testosterone: ['hormonal'],
  progesterone: ['hormonal'],
  cortisol: ['stress'],
  vitaminD: ['hormonal'],
  ferritin: ['recovery']
};

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

type MeasurementLike = {
  markerName: string;
};

export class LabPlanLinkService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  async autoLink(uploadId: string, userId: string, measurements: MeasurementLike[]): Promise<void> {
    const focusScores = this.deriveFocusScores(measurements);
    if (focusScores.size === 0) {
      return;
    }

    const plans = await this.prisma.longevityPlan.findMany({
      where: {
        userId,
        status: {
          in: ['READY', 'PROCESSING', 'DRAFT']
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (plans.length === 0) {
      return;
    }

    const ranked = this.rankPlans(plans, focusScores);
    const best = ranked[0];

    if (!best || best.score === 0) {
      return;
    }

    await this.prisma.panelUpload.update({
      where: { id: uploadId },
      data: { planId: best.plan.id }
    });

    const note = {
      type: 'LAB_UPLOAD',
      uploadId,
      biomarkers: measurements.slice(0, 10).map((measurement) => measurement.markerName),
      matchedFocusAreas: best.matchedAreas,
      createdAt: new Date().toISOString()
    };

    const existingEvidence = Array.isArray(best.plan.evidence) ? (best.plan.evidence as unknown[]) : [];
    const updatedEvidence = [...existingEvidence];
    updatedEvidence.push(note);
    while (updatedEvidence.length > 25) {
      updatedEvidence.shift();
    }

    const toJsonValue = (value: unknown): Prisma.InputJsonValue =>
      JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

    await this.prisma.longevityPlan.update({
      where: { id: best.plan.id },
      data: {
        evidence: toJsonValue(updatedEvidence)
      }
    });
  }

  private deriveFocusScores(measurements: MeasurementLike[]): Map<string, number> {
    const scores = new Map<string, number>();
    measurements.forEach((measurement) => {
      const normalized = normalize(measurement.markerName);
      const focusAreas = FOCUS_MAP[normalized];
      if (!focusAreas) {
        return;
      }
      focusAreas.forEach((focus) => {
        scores.set(focus, (scores.get(focus) ?? 0) + 1);
      });
    });
    return scores;
  }

  private rankPlans(
    plans: LongevityPlan[],
    focusScores: Map<string, number>
  ): Array<{ plan: LongevityPlan; score: number; matchedAreas: string[] }> {
    return plans
      .map((plan) => {
        const matches = (plan.focusAreas ?? []).filter((area) => focusScores.has(area));
        const score = matches.reduce((acc, area) => acc + (focusScores.get(area) ?? 0), 0);
        return { plan, score, matchedAreas: matches };
      })
      .sort((a, b) => b.score - a.score);
  }
}

export const labPlanLinkService = new LabPlanLinkService();

