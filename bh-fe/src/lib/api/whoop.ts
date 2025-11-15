import { apiFetch } from './http';

export type WhoopLinkStatus = {
  linked: boolean;
  linkUrl: string | null;
  state: string | null;
  expiresAt: string | null;
  lastSyncAt: string | null;
  syncStatus: 'PENDING' | 'ACTIVE' | 'ERROR';
};

type LinkPayload = {
  authorizationCode?: string;
  state?: string;
};

export const getWhoopStatus = (accessToken: string): Promise<WhoopLinkStatus> =>
  apiFetch<WhoopLinkStatus>('/integrations/whoop/status', {
    method: 'GET',
    authToken: accessToken
  });

export const requestWhoopLink = (accessToken: string, payload: LinkPayload = {}): Promise<WhoopLinkStatus> =>
  apiFetch<WhoopLinkStatus>('/integrations/whoop/link', {
    method: 'POST',
    authToken: accessToken,
    body: Object.keys(payload).length ? JSON.stringify(payload) : undefined
  });

export const unlinkWhoop = (accessToken: string): Promise<void> =>
  apiFetch<void>('/integrations/whoop', {
    method: 'DELETE',
    authToken: accessToken
  });

