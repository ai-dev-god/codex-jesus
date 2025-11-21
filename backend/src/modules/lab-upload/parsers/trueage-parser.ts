import type { PanelMeasurementInput } from '../../ai/panel-ingest.service';
import type { SpecializedParseResult, BiomarkerLookup, SpecializedParserOptions } from './types';

const normalizeLabel = (label: string): string =>
  label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const TRUEAGE_KEYWORDS = /trueage|trudiagnostic|dunedinpace|pace of aging|biological age/i;

type MetricConfig = {
  markerName: string;
  unit?: string;
  aliases: RegExp[];
  precision?: number;
};

const TRUEAGE_METRICS: MetricConfig[] = [
  {
    markerName: 'Biological Age',
    unit: 'years',
    aliases: [/biological age/i],
    precision: 1
  },
  {
    markerName: 'Chronological Age',
    unit: 'years',
    aliases: [/chronological age/i],
    precision: 1
  },
  {
    markerName: 'Pace of Aging',
    unit: 'ratio',
    aliases: [/pace of aging/i, /dunedin ?pace/i],
    precision: 2
  },
  {
    markerName: 'Telomere Length',
    unit: 'kb',
    aliases: [/telomere length/i],
    precision: 2
  },
  {
    markerName: 'Immune Age',
    unit: 'years',
    aliases: [/immune age/i],
    precision: 1
  },
  {
    markerName: 'Organ Age - Brain',
    unit: 'years',
    aliases: [/brain age/i],
    precision: 1
  },
  {
    markerName: 'Organ Age - Heart',
    unit: 'years',
    aliases: [/heart age/i, /cardiovascular age/i],
    precision: 1
  }
];

const buildMeasurement = (
  markerName: string,
  value: number,
  unit: string | undefined,
  biomarkerMap: BiomarkerLookup
): PanelMeasurementInput => {
  const key = normalizeLabel(markerName);
  const biomarker = biomarkerMap.get(key);
  return {
    markerName: biomarker?.name ?? markerName,
    biomarkerId: biomarker?.id,
    value,
    unit: unit ?? biomarker?.unit ?? undefined
  };
};

const extractValue = (text: string, config: MetricConfig): number | null => {
  for (const alias of config.aliases) {
    const regex = new RegExp(`${alias.source}\\s*[:\\-]*\\s*([-+]?\\d+(?:\\.\\d+)?)`, 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      const parsed = Number.parseFloat(match[1]);
      if (!Number.isNaN(parsed)) {
        return config.precision !== undefined ? Number(parsed.toFixed(config.precision)) : parsed;
      }
    }
  }
  return null;
};

const resolveMatchContext = (text: string, metric: MetricConfig): string | null => {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (metric.aliases.some((alias) => alias.test(line))) {
      return line.trim();
    }
  }
  return null;
};

export const parseTrueAgeReport = (
  text: string,
  biomarkerMap: BiomarkerLookup,
  _options?: SpecializedParserOptions
): SpecializedParseResult => {
  void _options;

  if (!TRUEAGE_KEYWORDS.test(text)) {
    return { matched: false, measurements: [], summary: '', notes: [] };
  }

  const measurements: PanelMeasurementInput[] = [];
  const notes: string[] = [];

  for (const metric of TRUEAGE_METRICS) {
    const value = extractValue(text, metric);
    if (value === null) {
      continue;
    }
    measurements.push(buildMeasurement(metric.markerName, value, metric.unit, biomarkerMap));
    const context = resolveMatchContext(text, metric);
    if (context) {
      notes.push(`Detected ${metric.markerName.toLowerCase()} from "${context}".`);
    }
  }

  if (measurements.length === 0) {
    return { matched: false, measurements: [], summary: '', notes: [] };
  }

  const summary = `TrueAge report parsed with ${measurements.length} key biomarkers, including biological age and pace of aging.`;
  notes.push('Parser: trueage-specialized');

  return {
    matched: true,
    measurements,
    summary,
    notes
  };
};

