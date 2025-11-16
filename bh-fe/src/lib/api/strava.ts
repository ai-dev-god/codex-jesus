import { apiFetch } from './http';

export type StravaLinkStatus = {
  linked: boolean;
  linkUrl: string | null;
  state: string | null;
  expiresAt: string | null;
  syncStatus: 'PENDING' | 'ACTIVE' | 'ERROR' | 'REVOKED';
  lastSyncAt: string | null;
  athlete: {
    id: number | null;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    city: string | null;
    country: string | null;
  } | null;
  summary: {
    totalDistanceMeters: number;
    totalMovingTimeSeconds: number;
    activityCount: number;
    longestDistanceMeters: number;
    longestActivityName: string | null;
    generatedAt: string;
  } | null;
};

type StravaLinkPayload = {
  authorizationCode?: string;
  state?: string;
  redirectUri?: string;
};

export const getStravaStatus = (accessToken: string): Promise<StravaLinkStatus> =>
  apiFetch<StravaLinkStatus>('/integrations/strava/status', {
    method: 'GET',
    authToken: accessToken
  });

export const requestStravaLink = (
  accessToken: string,
  payload?: StravaLinkPayload
): Promise<StravaLinkStatus> =>
  apiFetch<StravaLinkStatus>('/integrations/strava/link', {
    method: 'POST',
    authToken: accessToken,
    body: payload ? JSON.stringify(payload) : undefined
  });

export const unlinkStrava = (accessToken: string): Promise<void> =>
  apiFetch<void>('/integrations/strava', {
    method: 'DELETE',
    authToken: accessToken
  });

