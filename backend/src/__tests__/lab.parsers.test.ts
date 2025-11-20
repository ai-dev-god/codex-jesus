import type { Biomarker } from '@prisma/client';

import { parseTrueAgeReport } from '../modules/lab-upload/parsers/trueage-parser';
import { parseGenevaGiReport } from '../modules/lab-upload/parsers/geneva-gi-parser';
import type { BiomarkerLookup } from '../modules/lab-upload/parsers/types';

const mockBiomarker = (id: string, name: string, unit: string | null = null): Biomarker =>
  ({
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    unit,
    source: 'LAB_UPLOAD',
    referenceLow: null,
    referenceHigh: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }) as Biomarker;

const createLookup = (entries: Array<[string, Biomarker]>): BiomarkerLookup => {
  const map = new Map<string, Biomarker>();
  entries.forEach(([key, biomarker]) => {
    const normalized = key
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    map.set(normalized, biomarker);
  });
  return map;
};

describe('specialized lab parsers', () => {
  const biomarkerMap = createLookup([
    ['Biological Age', mockBiomarker('bio-age', 'Biological Age', 'years')],
    ['Pace of Aging', mockBiomarker('pace-aging', 'Pace of Aging')],
    ['Calprotectin', mockBiomarker('calprotectin', 'Calprotectin', 'µg/g')]
  ]);

  it('parses TrueAge report biomarkers', () => {
    const sample = `
      TruDiagnostic TrueAge™ Report
      Biological Age: 36.8 years
      Chronological Age: 34 years
      DunedinPACE: 0.98
      Telomere Length: 7.01 kb
    `;

    const result = parseTrueAgeReport(sample, biomarkerMap);

    expect(result.matched).toBe(true);
    expect(result.measurements).toHaveLength(4);
    expect(result.measurements[0]).toMatchObject({
      markerName: 'Biological Age',
      value: 36.8,
      unit: 'years'
    });
    expect(result.summary).toContain('TrueAge report parsed');
  });

  it('parses Geneva GI Effects markers', () => {
    const sample = `
      Genova Diagnostics GI Effects® Comprehensive Profile
      Calprotectin: 72 ug/g
      Elastase: 340 ug/g
      Secretory IgA: 110 mg/dL
      Beta-Glucuronidase: 450.5 U/g
    `;

    const result = parseGenevaGiReport(sample, biomarkerMap);

    expect(result.matched).toBe(true);
    expect(result.measurements).toHaveLength(4);
    expect(result.measurements.find((m) => m.markerName.includes('Calprotectin'))).toMatchObject({
      value: 72,
      unit: 'µg/g'
    });
    expect(result.summary).toContain('Geneva GI Effects report parsed');
  });
});

