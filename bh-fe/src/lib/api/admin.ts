import { apiFetch } from './http';
import type { AdminAccessSummary, Role, UserStatus } from './types';

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

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
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

export type AdminDataExportJob = {
  id: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  errorMessage: string | null;
  resultAvailable: boolean;
  user: UserSummary;
};

export type AdminDataDeletionJob = {
  id: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  summaryAvailable: boolean;
  user: UserSummary;
};

export type AdminDsarJobsResponse<T> = {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type LlmEngineMetricId = 'OPENCHAT_5' | 'GEMINI_2_5_PRO' | 'OPENBIO_LLM';

export type LlmEngineMetric = {
  id: LlmEngineMetricId;
  label: string;
  model: string | null;
  status: 'ACTIVE' | 'DECOMMISSIONED';
  requests: number;
  requestShare: number;
  tokens: number;
  costUsd: number;
  avgLatencyMs: number | null;
  successRate: number;
};

export type LlmUsageTimelinePoint = {
  date: string;
  engines: Record<'OPENCHAT_5' | 'GEMINI_2_5_PRO', number>;
};

export type LlmFeatureUsageMetric = {
  id: string;
  label: string;
  requestCount: number;
  percentage: number;
};

export type LlmUsageMetricsResponse = {
  generatedAt: string;
  windowDays: number;
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
    avgLatencyMs: number | null;
    successRate: number;
  };
  engines: LlmEngineMetric[];
  timeline: {
    usage: LlmUsageTimelinePoint[];
    cost: LlmUsageTimelinePoint[];
  };
  featureUsage: LlmFeatureUsageMetric[];
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

type DsraListParams = Partial<{
  cursor: string;
  limit: number;
}>;

export const listDataExportJobs = (
  token: string,
  params: DsraListParams = {}
): Promise<AdminDsarJobsResponse<AdminDataExportJob>> => {
  const query = buildQueryString({
    cursor: params.cursor,
    limit: params.limit
  });

  return apiFetch<AdminDsarJobsResponse<AdminDataExportJob>>(
    `/admin/privacy/data-exports${query}`,
    {
      method: 'GET',
      authToken: token
    }
  );
};

export const listDataDeletionJobs = (
  token: string,
  params: DsraListParams = {}
): Promise<AdminDsarJobsResponse<AdminDataDeletionJob>> => {
  const query = buildQueryString({
    cursor: params.cursor,
    limit: params.limit
  });

  return apiFetch<AdminDsarJobsResponse<AdminDataDeletionJob>>(
    `/admin/privacy/data-deletions${query}`,
    {
      method: 'GET',
      authToken: token
    }
  );
};

export const fetchAdminAccess = (accessToken: string): Promise<AdminAccessSummary> =>
  apiFetch<AdminAccessSummary>('/admin/access', {
    method: 'GET',
    authToken: accessToken
  });

export const fetchLlmUsageMetrics = (
  token: string,
  windowDays?: number
): Promise<LlmUsageMetricsResponse> => {
  const query = windowDays ? `?windowDays=${windowDays}` : '';
  return apiFetch<LlmUsageMetricsResponse>(`/admin/llm/metrics${query}`, {
    method: 'GET',
    authToken: token
  });
};

export type SystemOverview = {
  quickStats: {
    label: string;
    value: string;
    change: string;
    trend: 'up' | 'down' | 'stable';
  }[];
  recentActivity: {
    action: string;
    time: string;
    severity: 'info' | 'success' | 'warning' | 'error';
  }[];
};

export const fetchSystemOverview = (token: string): Promise<SystemOverview> =>
  apiFetch<SystemOverview>('/admin/overview', {
    method: 'GET',
    authToken: token
  });

export type SystemMetrics = {
  userGrowth: { month: string; users: number }[];
  revenue: { month: string; revenue: number }[];
  keyMetrics: { label: string; value: string; change: string }[];
  realtime: { activeNow: number; todaySignups: number; avgResponseTime: number };
};

export const fetchSystemMetrics = (token: string): Promise<SystemMetrics> =>
  apiFetch<SystemMetrics>('/admin/metrics/system', {
    method: 'GET',
    authToken: token
  });

export const fetchAppConfig = (token: string): Promise<Record<string, string>> =>
  apiFetch<Record<string, string>>('/admin/config', {
    method: 'GET',
    authToken: token
  });

export type AdminAuditLogActor = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status?: UserStatus;
};

export type AdminAuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  actor: AdminAuditLogActor;
  createdAt: string;
};

export type ListAuditLogsParams = Partial<{
  actorId: string;
  action: string;
  from: string;
  to: string;
  cursor: string;
  limit: number;
}>;

export type ListAuditLogsResponse = {
  data: AdminAuditLogEntry[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export const listAuditLogs = (
  token: string,
  params: ListAuditLogsParams = {}
): Promise<ListAuditLogsResponse> => {
  const query = buildQueryString({
    actorId: params.actorId,
    action: params.action,
    from: params.from,
    to: params.to,
    cursor: params.cursor,
    limit: params.limit
  });

  return apiFetch<ListAuditLogsResponse>(`/admin/audit${query}`, {
    method: 'GET',
    authToken: token
  });
};

export type FlagStatus = 'OPEN' | 'TRIAGED' | 'RESOLVED';
export type FlagTargetType = 'POST' | 'COMMENT' | 'INSIGHT' | 'BIOMARKER_LOG';

export type AdminFlagActor = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};

export type AdminFlagCommentTarget = {
  type: 'COMMENT';
  id: string;
  body: string;
  postId: string | null;
  author: AdminFlagActor | null;
};

export type AdminFlagPostTarget = {
  type: 'POST';
  id: string;
  body: string;
  author: AdminFlagActor | null;
};

export type AdminFlagInsightTarget = {
  type: 'INSIGHT';
  id: string;
  title: string | null;
  summary: string | null;
  author: AdminFlagActor | null;
};

export type AdminFlagBiomarkerTarget = {
  type: 'BIOMARKER_LOG';
  id: string;
  biomarker: {
    id: string;
    name: string;
    unit: string;
  } | null;
  value: number | null;
  capturedAt: string | null;
  owner: AdminFlagActor | null;
};

export type AdminFlagTarget =
  | AdminFlagCommentTarget
  | AdminFlagPostTarget
  | AdminFlagInsightTarget
  | AdminFlagBiomarkerTarget;

export type AdminFlagAuditEvent = {
  status: FlagStatus;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  actorId: string | null;
  occurredAt: string;
};

export type AdminFlag = {
  id: string;
  status: FlagStatus;
  reason: string;
  targetType: FlagTargetType;
  target: AdminFlagTarget | null;
  openedBy: AdminFlagActor;
  resolvedBy: AdminFlagActor | null;
  resolvedAt: string | null;
  auditTrail: { events: AdminFlagAuditEvent[] } | null;
  createdAt: string;
  updatedAt: string;
};

export type ListFlagsParams = Partial<{
  status: FlagStatus;
  cursor: string;
  limit: number;
}>;

export type ListFlagsResponse = {
  data: AdminFlag[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export const listAdminFlags = (
  token: string,
  params: ListFlagsParams = {}
): Promise<ListFlagsResponse> => {
  const query = buildQueryString({
    status: params.status,
    cursor: params.cursor,
    limit: params.limit
  });

  return apiFetch<ListFlagsResponse>(`/admin/flags${query}`, {
    method: 'GET',
    authToken: token
  });
};

export type ResolveFlagPayload = {
  status: Exclude<FlagStatus, 'OPEN'>;
  resolutionNotes?: string;
  metadata?: Record<string, unknown>;
};

export const resolveAdminFlag = (
  token: string,
  flagId: string,
  payload: ResolveFlagPayload
): Promise<AdminFlag> =>
  apiFetch<AdminFlag>(`/admin/flags/${flagId}/resolve`, {
    method: 'POST',
    authToken: token,
    body: JSON.stringify(payload)
  });

