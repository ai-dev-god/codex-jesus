import { apiFetch } from './http';
import type { LongevityPlan } from './types';

export interface LongevityPlanRequestInput {
  focusAreas?: string[];
  goals?: string[];
  riskTolerance?: 'low' | 'moderate' | 'high';
  includeUploads?: string[];
  includeWearables?: boolean;
  lifestyleNotes?: string;
  retryOf?: string;
}

export interface PanelMeasurementInput {
  biomarkerId?: string;
  markerName: string;
  value?: number;
  unit?: string;
  referenceLow?: number;
  referenceHigh?: number;
  capturedAt?: string;
  confidence?: number;
  flags?: Record<string, unknown>;
  source?: 'LAB_REPORT' | 'WEARABLE_EXPORT' | 'MANUAL_ENTRY';
}

export interface PanelUploadInput {
  storageKey: string;
  source?: 'LAB_REPORT' | 'WEARABLE_EXPORT' | 'MANUAL_ENTRY';
  contentType?: string;
  pageCount?: number;
  rawMetadata?: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
  measurements?: PanelMeasurementInput[];
}

export async function fetchLongevityPlans(accessToken: string, limit = 3): Promise<LongevityPlan[]> {
  return apiFetch<LongevityPlan[]>(`/ai/plans?limit=${limit}`, {
    authToken: accessToken,
    method: 'GET'
  });
}

export async function requestLongevityPlan(accessToken: string, payload: LongevityPlanRequestInput = {}) {
  return apiFetch<{ plan: LongevityPlan }>(`/ai/plans`, {
    authToken: accessToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function recordPanelUpload(accessToken: string, payload: PanelUploadInput) {
  return apiFetch(`/ai/uploads`, {
    authToken: accessToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

