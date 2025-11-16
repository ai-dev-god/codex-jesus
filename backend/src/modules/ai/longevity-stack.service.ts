import type { BiomarkerMeasurement, PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';

type StackDefinition = {
  id: string;
  title: string;
  focusArea: string;
  supplements: string[];
  description: string;
  biomarkers: string[];
};

export type LongevityStack = {
  id: string;
  title: string;
  focusArea: string;
  adherenceScore: number;
  impactDelta: number | null;
  keyBiomarkers: Array<{ markerName: string; deltaPercentage: number | null }>;
  recommendedSupplements: string[];
  narrative: string;
};

const STACK_DEFINITIONS: StackDefinition[] = [
  {
    id: 'metabolic',
    title: 'Metabolic Stack',
    focusArea: 'metabolic',
    supplements: ['Berberine', 'ALA', 'Magnesium Glycinate', 'Cinnamon'],
    description: 'Stabilize glucose variability and improve insulin sensitivity.',
    biomarkers: ['glucose', 'hba1c', 'insulin']
  },
  {
    id: 'cardiovascular',
    title: 'Cardiovascular Stack',
    focusArea: 'cardiovascular',
    supplements: ['Omega-3 EPA/DHA', 'Citrus Bergamot', 'Niacin'],
    description: 'Reduce ApoB/LDL particle load and support endothelial health.',
    biomarkers: ['apob', 'ldl', 'triglycerides', 'hdl']
  },
  {
    id: 'inflammation',
    title: 'Inflammation Stack',
    focusArea: 'inflammation',
    supplements: ['Curcumin', 'Boswellia', 'Astaxanthin'],
    description: 'Lower chronic inflammation and improve recovery capacity.',
    biomarkers: ['crp', 'homocysteine', 'il6']
  },
  {
    id: 'hormonal',
    title: 'Hormonal Stack',
    focusArea: 'hormonal',
    supplements: ['Ashwagandha', 'Vitamin D3/K2', 'Zinc'],
    description: 'Balance cortisol and sex hormones for better resilience.',
    biomarkers: ['cortisol', 'testosterone', 'progesterone']
  }
];

const toNumber = (value: BiomarkerMeasurement['value']): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export class LongevityStackService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  async computeStacks(userId: string): Promise<LongevityStack[]> {
    const measurements = await this.prisma.biomarkerMeasurement.findMany({
      where: { userId },
      orderBy: { capturedAt: 'desc' },
      take: 250
    });

    const latestByMarker = new Map<string, BiomarkerMeasurement>();
    const previousByMarker = new Map<string, BiomarkerMeasurement>();

    measurements.forEach((measurement) => {
      const key = measurement.markerName.toLowerCase();
      if (!latestByMarker.has(key)) {
        latestByMarker.set(key, measurement);
      } else if (!previousByMarker.has(key) && measurement.panelUploadId !== latestByMarker.get(key)?.panelUploadId) {
        previousByMarker.set(key, measurement);
      }
    });

    const stacks: LongevityStack[] = STACK_DEFINITIONS.map((definition) => {
      const keyBiomarkers = definition.biomarkers
        .map((marker) => {
          const latest = latestByMarker.get(marker);
          const previous = previousByMarker.get(marker);
          const latestValue = latest ? toNumber(latest.value) : null;
          const previousValue = previous ? toNumber(previous.value) : null;
          const delta =
            latestValue !== null && previousValue !== null && previousValue !== 0
              ? Number((((latestValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2))
              : null;
          return {
            markerName: latest?.markerName ?? marker,
            deltaPercentage: delta
          };
        })
        .filter((entry) => entry.markerName !== undefined);

      const validDeltas = keyBiomarkers.map((entry) => entry.deltaPercentage).filter((value): value is number => value !== null);
      const impactDelta =
        validDeltas.length > 0
          ? Number((validDeltas.reduce((sum, value) => sum + value, 0) / validDeltas.length).toFixed(2))
          : null;

      const improvements = validDeltas.filter((value) => value < 0).length;
      const regressions = validDeltas.filter((value) => value > 0).length;
      const adherenceScore = Math.max(35, Math.min(100, 60 + improvements * 8 - regressions * 5));

      const narrative =
        validDeltas.length === 0
          ? `${definition.title} needs new data — upload a fresh panel to benchmark progress.`
          : impactDelta !== null && impactDelta < 0
          ? `${definition.title} improved biomarkers by ${Math.abs(impactDelta)}%. Maintain the current stack for another 4 weeks.`
          : `${definition.title} drifted ${impactDelta ?? 0}% upward. Tighten adherence and review protocols.`;

      return {
        id: definition.id,
        title: definition.title,
        focusArea: definition.focusArea,
        adherenceScore,
        impactDelta,
        keyBiomarkers,
        recommendedSupplements: definition.supplements,
        narrative
      };
    });

    return stacks;
  }
}

export const longevityStackService = new LongevityStackService();

