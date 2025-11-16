import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, HardDrive, Activity, Clock, Users, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import { fetchDatabaseStatus, type DatabaseStatusSummary } from '../../lib/api/admin';

import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';

export default function DatabaseStatus() {
  const { ensureAccessToken } = useAuth();
  const [status, setStatus] = useState<DatabaseStatusSummary | null>(null);
  const [, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(
    async (showToast = false) => {
      if (!showToast) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const token = await ensureAccessToken();
        const data = await fetchDatabaseStatus(token);
        setStatus(data);
        if (showToast) {
          toast.success('Database metrics refreshed');
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Unable to load database metrics.');
        }
        if (showToast) {
          toast.error('Refresh failed');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ensureAccessToken]
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const tableStats = useMemo(() => status?.tables.slice(0, 4) ?? [], [status]);

  const connectionUsage = useMemo(() => {
    if (!status) {
      return 0;
    }
    const active = status.database.activeConnections;
    const computedMax = status.database.maxConnections ?? active;
    const max = computedMax || 1;
    return Math.min(100, Math.round((active / max) * 100));
  }, [status]);

  const handleRefresh = async () => {
    await loadStatus(true);
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  return (
    <div className="space-y-6">
      <div className="neo-card bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3>Database Overview</h3>
          <Button variant="outline" onClick={() => void handleRefresh()} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        {error && <div className="rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse mb-4">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <OverviewCard icon={Database} label="Database" value={status?.database.name ?? 'loading'} />
          <OverviewCard
            icon={Users}
            label="Connections"
            value={`${status?.database.activeConnections ?? 0}/${status?.database.maxConnections ?? '∞'}`}
          />
          <OverviewCard icon={Activity} label="Transactions" value={status?.database.transactionsCommitted ?? 0} />
          <OverviewCard icon={HardDrive} label="Size" value={formatBytes(status?.database.sizeBytes)} />
        </div>
      </div>

      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Connection Utilization</h3>
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-5 h-5 text-electric" />
          <span className="font-medium text-ink">{connectionUsage}% of available connections in use</span>
        </div>
        <Progress value={connectionUsage} className="h-2" />
        <p className="text-xs text-steel mt-2">
          {status?.database.activeConnections ?? 0} active / {status?.database.maxConnections ?? 'unlimited'} max
        </p>
      </div>

      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Top Tables</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tableStats.map((table) => (
            <div key={table.name} className="neo-card bg-pearl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-ink">{table.name}</p>
                  <p className="text-xs text-steel">{table.rowEstimate.toLocaleString()} rows</p>
                </div>
                <Badge className="bg-electric/20 text-electric">{formatBytes(table.sizeBytes)}</Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-steel">Index Scans</span>
                  <span className="font-bold text-ink">{table.indexScans.toLocaleString()}</span>
                </div>
                <div>
                  <Progress
                    value={Math.min(100, Math.round((table.indexScans / (table.rowEstimate || 1)) * 100))}
                    className="h-2"
                  />
                  <p className="text-xs text-steel mt-1">Scan/index ratio</p>
                </div>
              </div>
            </div>
          ))}
          {!tableStats.length && (
            <p className="text-sm text-steel col-span-2">Table statistics unavailable. Refresh to try again.</p>
          )}
        </div>
      </div>

      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Backup & Recovery</h3>
        <div className="space-y-3">
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-bio" />
              <div>
                <p className="font-medium text-ink">Total Size</p>
                <p className="text-sm text-steel">{formatBytes(status?.database.sizeBytes)}</p>
              </div>
            </div>
            <Badge className="bg-bio/20 text-bio">Primary</Badge>
          </div>
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-electric" />
              <div>
                <p className="font-medium text-ink">Transaction Lag</p>
                <p className="text-sm text-steel">
                  {status?.database.cacheHitRatio ? `${Math.round(status.database.cacheHitRatio * 100)}% cache hit` : '—'}
                </p>
              </div>
            </div>
            <Badge className="bg-electric/20 text-electric">Realtime</Badge>
          </div>
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-neural" />
              <div>
                <p className="font-medium text-ink">Stats Reset</p>
                <p className="text-sm text-steel">
                  {status?.database.statsResetAt
                    ? new Date(status.database.statsResetAt).toLocaleString()
                    : 'Awaiting data'}
                </p>
              </div>
            </div>
            <Badge className="bg-neural/20 text-neural">Monitoring</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

const OverviewCard = ({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
}) => (
  <div className="neo-card bg-white p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div>
      <p className="tag text-steel">{label}</p>
      <p className="text-xl font-bold text-ink">{value}</p>
    </div>
  </div>
);

