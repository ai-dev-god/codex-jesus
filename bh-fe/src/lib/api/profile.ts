import { apiFetch } from './http';

export type ConsentRecord = {
  type: string;
  granted: boolean;
  grantedAt: string | null;
  metadata: Record<string, unknown> | null;
};

export type Profile = {
  userId: string;
  displayName: string | null;
  timezone: string | null;
  baselineSurvey: Record<string, unknown> | null;
  consents: ConsentRecord[];
  onboardingCompletedAt: string | null;
  deleteRequested: boolean;
  tokens?: {
    access: {
      token: string;
      expiresIn: number;
    };
  };
};

export type UpdateProfilePayload = {
  displayName?: string;
  timezone?: string;
  baselineSurvey?: Record<string, unknown>;
  consents?: ConsentRecord[];
};

export type DataExportJob = {
  id: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  downloadUrl: string | null;
  payload: Record<string, unknown> | null | undefined;
  errorMessage: string | null;
};

export type DataDeletionJob = {
  id: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  summary: Record<string, unknown> | null | undefined;
  errorMessage: string | null;
};

export const fetchProfile = (accessToken: string): Promise<Profile> =>
  apiFetch<Profile>('/profiles/me', {
    method: 'GET',
    authToken: accessToken
  });

export const updateProfile = (accessToken: string, payload: UpdateProfilePayload): Promise<Profile> =>
  apiFetch<Profile>('/profiles/me', {
    method: 'PUT',
    authToken: accessToken,
    body: JSON.stringify(payload)
  });

export const requestDataExportJob = (accessToken: string): Promise<DataExportJob> =>
  apiFetch<DataExportJob>('/profiles/data-export', {
    method: 'POST',
    authToken: accessToken
  });

export const getLatestDataExportJob = (accessToken: string): Promise<DataExportJob | null> =>
  apiFetch<DataExportJob | null>('/profiles/data-export', {
    method: 'GET',
    authToken: accessToken
  });

export const requestDataDeletionJob = (accessToken: string): Promise<DataDeletionJob> =>
  apiFetch<DataDeletionJob>('/profiles/data-delete', {
    method: 'POST',
    authToken: accessToken
  });

export const getLatestDataDeletionJob = (accessToken: string): Promise<DataDeletionJob | null> =>
  apiFetch<DataDeletionJob | null>('/profiles/data-delete', {
    method: 'GET',
    authToken: accessToken
  });

