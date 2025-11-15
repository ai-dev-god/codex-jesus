import { apiFetch } from './http';
import type { DashboardSummary } from './types';

export const fetchDashboardSummary = (accessToken: string): Promise<DashboardSummary> =>
  apiFetch<DashboardSummary>('/dashboard/summary', {
    method: 'GET',
    authToken: accessToken
  });

