import type { Biomarker } from '@prisma/client';

import type { PanelMeasurementInput } from '../../ai/panel-ingest.service';

export type SpecializedParserOptions = {
  rawMetadata?: Record<string, unknown> | null;
  contentType?: string | null;
};

export type SpecializedParseResult = {
  matched: boolean;
  measurements: PanelMeasurementInput[];
  summary: string;
  notes: string[];
};

export type SpecializedParser = (
  text: string,
  biomarkerMap: Map<string, Biomarker>,
  options?: SpecializedParserOptions
) => SpecializedParseResult;

export type BiomarkerLookup = Map<string, Biomarker>;

