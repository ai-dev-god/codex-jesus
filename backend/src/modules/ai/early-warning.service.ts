import type { PrismaClient } from '@prisma/client';

import prismaClient from '../../lib/prisma';

type WarningRule = {
  marker: string;
  threshold: number;
  direction: 'above' | 'below';
  message: string;
};

export type EarlyWarning = {
  markerName: string;
  value: number | null;
  unit: string | null;
  message: string;
  capturedAt: string | null;
};

const RULES: WarningRule[] = [
  { marker: 'glucose', threshold: 105, direction: 'above', message: 'Fasting glucose trending high. Recheck metabolic inputs.' },
  { marker: 'crp', threshold: 3, direction: 'above', message: 'Inflammation marker elevated.' },
  { marker: 'hrv', threshold: 55, direction: 'below', message: 'HRV suppressed. Increase recovery blocks.' }
];

export class EarlyWarningService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  async detect(userId: string): Promise<EarlyWarning[]> {
    const markers = RULES.map((rule) => rule.marker);
    const measurements = await this.prisma.biomarkerMeasurement.findMany({
      where: { userId, markerName: { in: markers } },
      orderBy: { capturedAt: 'desc' }
    });

    const latest = new Map<string, typeof measurements[number]>();
    measurements.forEach((measurement) => {
      const key = measurement.markerName.toLowerCase();
      if (!latest.has(key)) {
        latest.set(key, measurement);
      }
    });

    const warnings: EarlyWarning[] = [];
    RULES.forEach((rule) => {
      const sample = latest.get(rule.marker);
      if (!sample) {
        return;
      }
      const value = sample.value ? Number(sample.value) : null;
      if (value === null) {
        return;
      }
      if (
        (rule.direction === 'above' && value >= rule.threshold) ||
        (rule.direction === 'below' && value <= rule.threshold)
      ) {
        warnings.push({
          markerName: sample.markerName,
          value,
          unit: sample.unit ?? null,
          message: rule.message,
          capturedAt: sample.capturedAt?.toISOString() ?? null
        });
      }
    });

    return warnings;
  }
}

export const earlyWarningService = new EarlyWarningService();

