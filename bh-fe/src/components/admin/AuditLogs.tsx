import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Download, Eye, User, Database, Settings, Shield, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import { listAuditLogs, type AdminAuditLogEntry } from '../../lib/api/admin';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type AuditCategory = 'auth' | 'data' | 'config' | 'security';

type DisplayLog = {
  entry: AdminAuditLogEntry;
  category: AuditCategory;
  status: 'success' | 'warning' | 'error';
  resource: string;
  actorLabel: string;
  actorEmail: string;
  timestamp: string;
  relativeTime: string;
};

const PAGE_SIZE = 50;

export default function AuditLogs() {
  const { ensureAccessToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<AuditCategory | 'all'>('all');
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processedLogs = useMemo<DisplayLog[]>(() => {
    return logs.map((entry) => {
      const category = deriveCategory(entry);
      const status = deriveStatus(entry);
      const resource = formatResource(entry);
      const actorLabel = entry.actor.displayName?.trim() || entry.actor.email;
      const actorEmail = entry.actor.email;
      const timestamp = new Date(entry.createdAt).toLocaleString();
      const relativeTime = formatRelativeTime(entry.createdAt);

      return {
        entry,
        category,
        status,
        resource,
        actorLabel,
        actorEmail,
        timestamp,
        relativeTime
      };
    });
  }, [logs]);

  const stats = useMemo(() => {
    const aggregate = { total: processedLogs.length, success: 0, warning: 0, error: 0 };
    for (const log of processedLogs) {
      aggregate[log.status] += 1;
    }
    return aggregate;
  }, [processedLogs]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return processedLogs.filter((log) => {
      const matchesCategory = filterCategory === 'all' || log.category === filterCategory;
      if (!matchesCategory) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        log.actorLabel.toLowerCase().includes(normalizedQuery) ||
        log.actorEmail.toLowerCase().includes(normalizedQuery) ||
        log.entry.action.toLowerCase().includes(normalizedQuery) ||
        log.resource.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [filterCategory, processedLogs, searchQuery]);

  const fetchLogs = useCallback(
    async (cursorOverride?: string | null, reset = false) => {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const token = await ensureAccessToken();
        const response = await listAuditLogs(token, {
          limit: PAGE_SIZE,
          cursor: cursorOverride ?? undefined
        });

        if (reset) {
          setLogs(response.data);
        } else {
          setLogs((prev) => [...prev, ...response.data]);
        }

        setNextCursor(response.meta.nextCursor);
        setHasMore(response.meta.hasMore);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Unable to load audit logs.';
        setError(message);
        if (!reset) {
          toast.error(message);
        }
      } finally {
        if (reset) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [ensureAccessToken]
  );

  useEffect(() => {
    void fetchLogs(undefined, true);
  }, [fetchLogs]);

  const handleRefresh = useCallback(() => {
    void fetchLogs(undefined, true);
  }, [fetchLogs]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || !nextCursor) {
      return;
    }
    void fetchLogs(nextCursor, false);
  }, [fetchLogs, hasMore, nextCursor]);

  const handleExport = useCallback(() => {
    if (processedLogs.length === 0) {
      toast.info('No audit logs to export yet.');
      return;
    }

    const payload = processedLogs.map((log) => log.entry);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `audit-logs-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Audit log export ready.');
  }, [processedLogs]);

  const handleViewLog = useCallback(async (entry: AdminAuditLogEntry) => {
    const payload = {
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
      actor: entry.actor,
      createdAt: entry.createdAt
    };
    const serialized = JSON.stringify(payload, null, 2);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(serialized);
        toast.success('Log details copied to clipboard.');
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      toast.error('Unable to copy log details.');
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Total Events</p>
          <p className="text-2xl font-bold text-ink">{stats.total}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Successful</p>
          <p className="text-2xl font-bold text-bio">{stats.success}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Warnings</p>
          <p className="text-2xl font-bold text-neural">{stats.warning}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Errors</p>
          <p className="text-2xl font-bold text-pulse">{stats.error}</p>
        </div>
      </div>

      <div className="neo-card bg-white p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex-1 w-full lg:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-steel" />
              <Input
                placeholder="Search audit logs..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Select
              value={filterCategory}
              onValueChange={(value: AuditCategory | 'all') => setFilterCategory(value)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="auth">Authentication</SelectItem>
                <SelectItem value="data">Data Operations</SelectItem>
                <SelectItem value="config">Configuration</SelectItem>
                <SelectItem value="security">Security</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={processedLogs.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      <div className="neo-card bg-white overflow-hidden">
        {error && (
          <div className="bg-pulse/10 border-b border-pulse/30 px-6 py-3 text-sm text-pulse">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && logs.length === 0 &&
                Array.from({ length: 4 }).map((_, idx) => (
                  <TableRow key={`audit-skeleton-${idx}`}>
                    <TableCell>
                      <div className="h-4 w-32 rounded bg-cloud animate-pulse mb-2" />
                      <div className="h-3 w-20 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-cloud animate-pulse" />
                        <div>
                          <div className="h-4 w-24 rounded bg-cloud animate-pulse mb-1" />
                          <div className="h-3 w-32 rounded bg-cloud animate-pulse" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-40 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-28 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-16 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-8 w-8 rounded-full bg-cloud animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))}

              {filteredLogs.map((log) => (
                <TableRow key={log.entry.id}>
                  <TableCell className="text-steel font-mono text-sm">
                    <div>{log.timestamp}</div>
                    <div className="text-xs text-steel/80">{log.relativeTime}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(log.category)}
                      <div>
                        <p className="font-medium text-ink">{log.actorLabel}</p>
                        <p className="text-xs text-steel">{log.actorEmail}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-ink">{log.entry.action}</TableCell>
                  <TableCell className="text-steel font-mono text-sm">{log.resource}</TableCell>
                  <TableCell>
                    <Badge className={statusBadgeClass(log.status)}>{capitalize(log.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => void handleViewLog(log.entry)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-steel py-10">
                    No audit events match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {hasMore && (
          <div className="p-4 border-t border-cloud flex justify-center">
            <Button variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const deriveCategory = (entry: AdminAuditLogEntry): AuditCategory => {
  const action = entry.action.toLowerCase();
  const target = entry.targetType.toLowerCase();

  if (
    target.includes('user') ||
    action.includes('auth') ||
    action.includes('login') ||
    action.includes('role')
  ) {
    return 'auth';
  }
  if (
    action.includes('config') ||
    action.includes('settings') ||
    target.includes('config')
  ) {
    return 'config';
  }
  if (
    action.includes('service_api_key') ||
    action.includes('security') ||
    target.includes('api_key')
  ) {
    return 'security';
  }
  return 'data';
};

const deriveStatus = (entry: AdminAuditLogEntry): 'success' | 'warning' | 'error' => {
  const action = entry.action.toUpperCase();
  if (action.includes('FAILED') || action.includes('ERROR')) {
    return 'error';
  }
  if (action.includes('WARN')) {
    return 'warning';
  }
  return 'success';
};

const formatResource = (entry: AdminAuditLogEntry): string => {
  if (entry.targetId) {
    return `${entry.targetType}:${entry.targetId}`;
  }
  return entry.targetType;
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'Just now';
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }
  if (diffMs < day * 7) {
    return `${Math.floor(diffMs / day)}d ago`;
  }
  return date.toLocaleString();
};

const getCategoryIcon = (category: AuditCategory) => {
  switch (category) {
    case 'auth':
      return <User className="w-4 h-4 text-electric" />;
    case 'data':
      return <Database className="w-4 h-4 text-bio" />;
    case 'config':
      return <Settings className="w-4 h-4 text-neural" />;
    case 'security':
      return <Shield className="w-4 h-4 text-pulse" />;
    default:
      return null;
  }
};

const statusBadgeClass = (status: 'success' | 'warning' | 'error'): string => {
  switch (status) {
    case 'success':
      return 'bg-bio/20 text-bio';
    case 'warning':
      return 'bg-neural/20 text-neural';
    case 'error':
      return 'bg-pulse/20 text-pulse';
  }
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

