import { apiFetch } from './http';
import type { AdminAccessSummary } from './types';

export const fetchAdminAccess = (accessToken: string): Promise<AdminAccessSummary> =>
  apiFetch<AdminAccessSummary>('/admin/access', {
    method: 'GET',
    authToken: accessToken
  });

