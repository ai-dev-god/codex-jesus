import type { PanelMeasurementInput } from '../../ai/panel-ingest.service';
import type { SpecializedParseResult, BiomarkerLookup, SpecializedParserOptions } from './types';

const GENEVA_KEYWORDS = /gi effects|genova diagnostics|stool analysis|maldigestion|dysbiosis/i;

type GiMetricConfig = {
  markerName: string;
  unit?: string;
  aliases: RegExp[];
  precision?: number;
};

const GENEVA_METRICS: GiMetricConfig[] = [
  {
    markerName: 'Calprotectin',
    unit: 'µg/g',
    aliases: [/calprotectin/i],
    precision: 0
  },
  {
    markerName: 'Secretory IgA',
    unit: 'mg/dL',
    aliases: [/secretory\s*iga/i],
    precision: 0
  },
  {
    markerName: 'Elastase',
    unit: 'µg/g',
    aliases: [/elastase/i],
    precision: 0
  },
  {
    markerName: 'Beta-Glucuronidase',
    unit: 'U/g',
    aliases: [/beta[-\s]?glucuronidase/i],
    precision: 1
  },
  {
    markerName: 'Short Chain Fatty Acids - Butyrate',
    unit: 'mmol/g',
    aliases: [/butyrate/i],
    precision: 2
  },
  {
    markerName: 'Short Chain Fatty Acids - Propionate',
    unit: 'mmol/g',
    aliases: [/propionate/i],
    precision: 2
  },
  {
    markerName: 'Short Chain Fatty Acids - Acetate',
    unit: 'mmol/g',
    aliases: [/acetate/i],
    precision: 2
  },
  {
    markerName: 'Lactoferrin',
    unit: 'µg/g',
    aliases: [/lactoferrin/i],
    precision: 0
  },
  {
    markerName: 'pH (Stool)',
    unit: 'pH',
    aliases: [/stool pH|ph \(stool\)/i],
    precision: 2
  }
];

const normaliseKey = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const extractMetricValue = (text: string, config: GiMetricConfig): number | null => {
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

const mapToMeasurement = (
  markerName: string,
  value: number,
  unit: string | undefined,
  biomarkerMap: BiomarkerLookup
): PanelMeasurementInput => {
  const key = normaliseKey(markerName);
  const biomarker = biomarkerMap.get(key);
  return {
    markerName: biomarker?.name ?? markerName,
    biomarkerId: biomarker?.id,
    value,
    unit: unit ?? biomarker?.unit ?? undefined
  };
};

const buildNote = (text: string, aliases: RegExp[]): string | null => {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (aliases.some((alias) => alias.test(line))) {
      return line.trim();
    }
  }
  return null;
};

export const parseGenevaGiReport = (
  text: string,
  biomarkerMap: BiomarkerLookup,
  options?: SpecializedParserOptions
): SpecializedParseResult => {
  const normalizedFileName =
    typeof options?.rawMetadata?.fileName === 'string'
      ? options.rawMetadata.fileName.toLowerCase()
      : '';

  if (!GENEVA_KEYWORDS.test(text) && !/gi-effects/.test(normalizedFileName)) {
    return { matched: false, measurements: [], summary: '', notes: [] };
  }

  const measurements: PanelMeasurementInput[] = [];
  const notes: string[] = [];

  for (const metric of GENEVA_METRICS) {
    const value = extractMetricValue(text, metric);
    if (value === null) {
      continue;
    }

    measurements.push(mapToMeasurement(metric.markerName, value, metric.unit, biomarkerMap));
    const context = buildNote(text, metric.aliases);
    if (context) {
      notes.push(`GI marker "${metric.markerName}" parsed from "${context}".`);
    }
  }

  if (measurements.length === 0) {
    return { matched: false, measurements: [], summary: '', notes: [] };
  }

  notes.push('Parser: geneva-gi-specialized');
  const summary = `Geneva GI Effects report parsed with ${measurements.length} gut health markers.`;

  return {
    matched: true,
    measurements,
    summary,
    notes
  };
};

