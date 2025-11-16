import { apiFetch } from './http';
import type {
  AiInterpretation,
  CohortBenchmark,
  EarlyWarning,
  LongevityPlan,
  LongevityStack,
  PanelUploadSummary
} from './types';

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
  sessionId: string;
  storageKey: string;
  source?: 'LAB_REPORT' | 'WEARABLE_EXPORT' | 'MANUAL_ENTRY';
  contentType?: string;
  pageCount?: number;
  rawMetadata?: Record<string, unknown>;
  normalizedPayload?: Record<string, unknown>;
  measurements?: PanelMeasurementInput[];
}

export interface CreatePanelUploadSessionInput {
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}

export interface PanelUploadSession {
  sessionId: string;
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
  kmsKeyName: string | null;
  maxBytes: number;
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
  return apiFetch<PanelUploadSummary>(`/ai/uploads`, {
    authToken: accessToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createPanelUploadSession(
  accessToken: string,
  payload: CreatePanelUploadSessionInput
): Promise<PanelUploadSession> {
  return apiFetch<PanelUploadSession>(`/ai/uploads/sessions`, {
    authToken: accessToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchPanelUploads(accessToken: string, limit = 10): Promise<PanelUploadSummary[]> {
  const search = new URLSearchParams({ limit: limit.toString() }).toString();
  return apiFetch<PanelUploadSummary[]>(`/ai/uploads?${search}`, {
    authToken: accessToken,
    method: 'GET'
  });
}

export async function fetchPanelUpload(accessToken: string, uploadId: string): Promise<PanelUploadSummary> {
  return apiFetch<PanelUploadSummary>(`/ai/uploads/${uploadId}`, {
    authToken: accessToken,
    method: 'GET'
  });
}

export interface PanelUploadTagPayload {
  planId?: string | null;
  biomarkerIds?: string[];
}

export async function updatePanelUploadTags(
  accessToken: string,
  uploadId: string,
  payload: PanelUploadTagPayload
): Promise<PanelUploadSummary> {
  return apiFetch<PanelUploadSummary>(`/ai/uploads/${uploadId}/tags`, {
    authToken: accessToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export type PanelDownloadSession = {
  url: string;
  expiresAt: string;
  token?: string;
};

export async function fetchPanelUploadDownloadUrl(
  accessToken: string,
  uploadId: string
): Promise<PanelDownloadSession> {
  return apiFetch<PanelDownloadSession>(`/ai/uploads/${uploadId}/download`, {
    authToken: accessToken,
    method: 'GET'
  });
}

export async function fetchLongevityStacks(accessToken: string): Promise<LongevityStack[]> {
  return apiFetch<LongevityStack[]>(`/ai/stacks`, {
    authToken: accessToken,
    method: 'GET'
  });
}

export async function requestAiInterpretation(
  accessToken: string,
  uploadId: string
): Promise<AiInterpretation> {
  return apiFetch<AiInterpretation>(`/ai/interpretations`, {
    authToken: accessToken,
    method: 'POST',
    body: JSON.stringify({ uploadId })
  });
}

export async function fetchCohortBenchmarks(accessToken: string): Promise<CohortBenchmark[]> {
  return apiFetch<CohortBenchmark[]>(`/ai/cohort-benchmarks`, {
    authToken: accessToken,
    method: 'GET'
  });
}

export async function fetchEarlyWarnings(accessToken: string): Promise<EarlyWarning[]> {
  return apiFetch<EarlyWarning[]>(`/ai/early-warnings`, {
    authToken: accessToken,
    method: 'GET'
  });
}

