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

