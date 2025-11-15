import { apiFetch } from './http';
import type { Role, UserStatus } from './types';

export type AdminUserPlanTier = 'explorer' | 'biohacker' | 'longevity_pro';

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  joinedAt: string;
  lastLoginAt: string | null;
  planTier: AdminUserPlanTier;
  biomarkersLogged: number;
  protocolsActive: number;
};

export type ListAdminUsersResponse = {
  data: AdminUser[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type CreateAdminUserPayload = {
  email: string;
  fullName: string;
  role: Role;
  status?: UserStatus;
  timezone?: string;
};

export type CreateAdminUserResponse = {
  user: AdminUser;
  temporaryPassword: string;
};

export type UpdateAdminUserPayload = Partial<{
  fullName: string;
  role: Role;
  status: UserStatus;
}>;

export type SystemHealthSummary = {
  generatedAt: string;
  queues: {
    totalPending: number;
    insights: QueueLagSummary;
    whoop: QueueLagSummary;
    otherQueues: Record<string, QueueLagSummary>;
  };
  sync: {
    pendingConnections: number;
    staleConnections: number;
  };
  ai: {
    jobsLast24h: number;
    failedJobsLast24h: number;
    retriesLast24h: number;
    retryRate: number;
  };
};

export type QueueLagSummary = {
  pending: number;
  maxLagSeconds: number;
  averageLagSeconds: number;
};

export type DatabaseStatusSummary = {
  database: {
    name: string;
    sizeBytes: number;
    activeConnections: number;
    maxConnections: number | null;
    transactionsCommitted: number;
    transactionsRolledBack: number;
    cacheHitRatio: number | null;
    deadlocks: number;
    statsResetAt: string | null;
  };
  tables: Array<{
    name: string;
    rowEstimate: number;
    sizeBytes: number;
    indexScans: number;
  }>;
};

export type BackupJob = {
  id: string;
  type: 'FULL' | 'INCREMENTAL';
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  storageUri: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  initiatedBy: {
    id: string;
    displayName: string;
    email: string;
    role: Role;
  } | null;
};

export type BackupJobsResponse = {
  data: BackupJob[];
};

export type BackupSettings = {
  autoBackupEnabled: boolean;
  frequency: 'hourly' | 'six_hours' | 'daily' | 'weekly';
};

export type ApiKey = {
  id: string;
  name: string;
  scope: 'READ' | 'WRITE' | 'FULL';
  status: 'ACTIVE' | 'REVOKED';
  maskedKey: string;
  prefix: string;
  suffix: string;
  requestCount: number;
  createdAt: string;
  lastUsedAt: string | null;
  lastRotatedAt: string | null;
};

export type ApiKeysResponse = {
  data: ApiKey[];
};

export type CreateApiKeyPayload = {
  name: string;
  scope?: ApiKey['scope'];
};

export type CreateApiKeyResponse = {
  apiKey: ApiKey;
  plaintextKey: string;
};

export type RotateApiKeyResponse = CreateApiKeyResponse;

export type ListAdminUsersParams = Partial<{
  search: string;
  role: Role;
  status: UserStatus;
  cursor: string;
  limit: number;
}>;

const buildQueryString = (params: Record<string, string | number | undefined | null>): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

export const listAdminUsers = (token: string, params: ListAdminUsersParams = {}): Promise<ListAdminUsersResponse> => {
  const query = buildQueryString({
    search: params.search,
    role: params.role,
    status: params.status,
    cursor: params.cursor,
    limit: params.limit
  });

  return apiFetch<ListAdminUsersResponse>(`/admin/users${query}`, {
    method: 'GET',
    authToken: token
  });
};

export const createAdminUser = (
  token: string,
  payload: CreateAdminUserPayload
): Promise<CreateAdminUserResponse> =>
  apiFetch<CreateAdminUserResponse>(`/admin/users`, {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(payload)
  });

export const updateAdminUser = (
  token: string,
  userId: string,
  payload: UpdateAdminUserPayload
): Promise<AdminUser> =>
  apiFetch<AdminUser>(`/admin/users/${userId}`, {
    method: 'PUT',
    authToken: token,
    body: JSON.stringify(payload)
  });

export const deleteAdminUser = (token: string, userId: string): Promise<void> =>
  apiFetch<void>(`/admin/users/${userId}`, {
    method: 'DELETE',
    authToken: token
  });

export const setAdminUserStatus = (token: string, userId: string, status: UserStatus): Promise<AdminUser> =>
  apiFetch<AdminUser>(`/admin/users/${userId}/status`, {
    method: 'POST',
    authToken: token,
    body: JSON.stringify({ status })
  });

export const fetchSystemHealth = (token: string): Promise<SystemHealthSummary> =>
  apiFetch<SystemHealthSummary>(`/admin/system-health`, {
    method: 'GET',
    authToken: token
  });

export const fetchDatabaseStatus = (token: string): Promise<DatabaseStatusSummary> =>
  apiFetch<DatabaseStatusSummary>(`/admin/database/status`, {
    method: 'GET',
    authToken: token
  });

export const listBackupJobs = (token: string): Promise<BackupJobsResponse> =>
  apiFetch<BackupJobsResponse>(`/admin/backups`, {
    method: 'GET',
    authToken: token
  });

export const triggerBackupJob = (
  token: string,
  type: 'FULL' | 'INCREMENTAL' = 'FULL'
): Promise<BackupJob> =>
  apiFetch<BackupJob>(`/admin/backups`, {
    method: 'POST',
    authToken: token,
    body: JSON.stringify({ type })
  });

export const deleteBackupJob = (token: string, backupId: string): Promise<void> =>
  apiFetch<void>(`/admin/backups/${backupId}`, {
    method: 'DELETE',
    authToken: token
  });

export const requestBackupRestore = (token: string, backupId: string): Promise<BackupJob> =>
  apiFetch<BackupJob>(`/admin/backups/${backupId}/restore`, {
    method: 'POST',
    authToken: token
  });

export const fetchBackupDownloadLink = (
  token: string,
  backupId: string
): Promise<{ url: string }> =>
  apiFetch<{ url: string }>(`/admin/backups/${backupId}/download`, {
    method: 'GET',
    authToken: token
  });

export const fetchBackupSettings = (token: string): Promise<BackupSettings> =>
  apiFetch<BackupSettings>(`/admin/backups/settings`, {
    method: 'GET',
    authToken: token
  });

export const updateBackupSettings = (token: string, settings: BackupSettings): Promise<BackupSettings> =>
  apiFetch<BackupSettings>(`/admin/backups/settings`, {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(settings)
  });

export const listApiKeys = (token: string): Promise<ApiKeysResponse> =>
  apiFetch<ApiKeysResponse>(`/admin/api-keys`, {
    method: 'GET',
    authToken: token
  });

export const createApiKey = (
  token: string,
  payload: CreateApiKeyPayload
): Promise<CreateApiKeyResponse> =>
  apiFetch<CreateApiKeyResponse>(`/admin/api-keys`, {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(payload)
  });

export const rotateApiKey = (token: string, keyId: string): Promise<RotateApiKeyResponse> =>
  apiFetch<RotateApiKeyResponse>(`/admin/api-keys/${keyId}/rotate`, {
    method: 'POST',
    authToken: token
  });

export const revokeApiKey = (token: string, keyId: string): Promise<ApiKey> =>
  apiFetch<ApiKey>(`/admin/api-keys/${keyId}/revoke`, {
    method: 'POST',
    authToken: token
  });
import { apiFetch } from './http';
import type { AdminAccessSummary } from './types';

export const fetchAdminAccess = (accessToken: string): Promise<AdminAccessSummary> =>
  apiFetch<AdminAccessSummary>('/admin/access', {
    method: 'GET',
    authToken: accessToken
  });

