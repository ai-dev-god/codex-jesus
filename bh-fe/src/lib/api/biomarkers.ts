import { apiFetch } from './http';
import type { BiomarkerDefinition, BiomarkerLog } from './types';

export type ManualBiomarkerLogPayload = {
  biomarkerId: string;
  value: number;
  unit?: string | null;
  capturedAt: string;
  source: 'MANUAL';
  notes?: string;
};

export const listBiomarkerDefinitions = (accessToken: string): Promise<BiomarkerDefinition[]> =>
  apiFetch<BiomarkerDefinition[]>('/biomarkers', {
    method: 'GET',
    authToken: accessToken
  });

export const createManualBiomarkerLog = (
  accessToken: string,
  payload: ManualBiomarkerLogPayload
): Promise<BiomarkerLog> =>
  apiFetch<BiomarkerLog>('/biomarker-logs', {
    method: 'POST',
    authToken: accessToken,
    body: payload
  });

