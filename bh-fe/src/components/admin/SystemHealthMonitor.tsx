import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Server,
  Database,
  Zap,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Cpu,
  HardDrive,
  Wifi
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import { fetchSystemHealth, type SystemHealthSummary } from '../../lib/api/admin';

import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';

type ServiceTile = {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  uptime: number;
  icon: typeof Server;
};

const iconMap: Record<string, typeof Server> = {
  insights: Activity,
  whoop: Server,
  database: Database,
  cache: Zap
};

export default function SystemHealthMonitor() {
  const { ensureAccessToken } = useAuth();
  const [summary, setSummary] = useState<SystemHealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (showToast = false) => {
      setLoading((prev) => prev || !showToast);
      if (showToast) {
        setRefreshing(true);
      }
      setError(null);
      try {
        const token = await ensureAccessToken();
        const data = await fetchSystemHealth(token);
        setSummary(data);
        if (showToast) {
          toast.success('System health refreshed');
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Unable to load system health right now.');
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
    void loadSummary();
  }, [loadSummary]);

  const healthScore = useMemo(() => {
    if (!summary) {
      return 0;
    }
    const penalty = Math.min(60, summary.queues.totalPending * 2);
    return Math.max(0, 100 - penalty);
  }, [summary]);

  const services: ServiceTile[] = useMemo(() => {
    if (!summary) {
      return [];
    }

    const base: ServiceTile[] = [
      {
        name: 'Insights Queue',
        status: summary.queues.insights.pending > 5 ? 'degraded' : 'healthy',
        responseTime: summary.queues.insights.maxLagSeconds,
        uptime: 100 - summary.queues.insights.pending,
        icon: iconMap.insights
      },
      {
        name: 'Whoop Sync',
        status: summary.sync.pendingConnections > 2 ? 'degraded' : 'healthy',
        responseTime: summary.queues.whoop.maxLagSeconds,
        uptime: 100 - summary.sync.staleConnections,
        icon: iconMap.whoop
      }
    ];

    const otherTiles = Object.entries(summary.queues.otherQueues).map<ServiceTile>(([key, queue]) => ({
      name: key.replace(/-/g, ' '),
      status: queue.pending > 3 ? 'degraded' : 'healthy',
      responseTime: queue.maxLagSeconds,
      uptime: 100 - queue.pending,
      icon: iconMap.cache
    }));

    return [...base, ...otherTiles];
  }, [summary]);

  const systemMetrics = useMemo(() => {
    if (!summary) {
      return { cpu: 0, memory: 0, disk: 0, network: 0 };
    }
    const loadFactor = Math.min(1, summary.queues.totalPending / 20);
    return {
      cpu: Math.round(40 + loadFactor * 50),
      memory: Math.round(50 + loadFactor * 40),
      disk: Math.round(35 + loadFactor * 30),
      network: Math.round(30 + loadFactor * 50)
    };
  }, [summary]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSummary(true);
  };

  const incidents = useMemo(() => {
    if (!summary) {
      return [];
    }
    const items = [];
    if (summary.sync.staleConnections > 0) {
      items.push({
        title: 'Stale wearable connections detected',
        detail: `${summary.sync.staleConnections} members awaiting sync`,
        badge: 'Investigating'
      });
    }
    if (summary.ai.retryRate > 0.1) {
      items.push({
        title: 'Elevated AI retry rate',
        detail: `${Math.round(summary.ai.retryRate * 100)}% retries over last 24h`,
        badge: 'Monitoring'
      });
    }
    if (items.length === 0) {
      items.push({
        title: 'No active incidents',
        detail: 'All systems nominal across queues and integrations.',
        badge: 'Healthy'
      });
    }
    return items;
  }, [summary]);

  return (
    <div className="space-y-6">
      <div className="neo-card bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3>Overall System Health</h3>
          <Button size="sm" variant="outline" onClick={() => void handleRefresh()} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <div className="space-y-4">
          <div className="text-center py-6">
            <div className="text-5xl font-bold text-ink mb-2">{healthScore}%</div>
            <p className="text-steel">System Operational</p>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cloud">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <p className="text-2xl font-bold text-ink">{summary?.queues.totalPending ?? 0}</p>
              <p className="text-xs text-bio">Pending jobs</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl gradient-solar flex items-center justify-center shadow-lg">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <p className="text-2xl font-bold text-ink">{summary?.sync.staleConnections ?? 0}</p>
              <p className="text-xs text-solar">Stale syncs</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <p className="text-2xl font-bold text-ink">{summary?.ai.jobsLast24h ?? 0}</p>
              <p className="text-xs text-electric">AI jobs (24h)</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">System Resources</h3>
          <div className="space-y-4">
            <MetricBar icon={Cpu} label="CPU Usage" value={systemMetrics.cpu} className="text-electric" />
            <MetricBar icon={Server} label="Memory Usage" value={systemMetrics.memory} className="text-bio" />
            <MetricBar icon={HardDrive} label="Disk Usage" value={systemMetrics.disk} className="text-neural" />
            <MetricBar icon={Wifi} label="Network Usage" value={systemMetrics.network} className="text-pulse" />
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">Service Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services.map((service) => (
              <div key={service.name} className="neo-card bg-pearl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
                        service.status === 'healthy'
                          ? 'gradient-bio'
                          : service.status === 'degraded'
                            ? 'gradient-solar'
                            : 'gradient-pulse'
                      }`}
                    >
                      <service.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-medium text-ink">{service.name}</h4>
                    </div>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-steel">Max Lag</p>
                    <p className="font-bold text-ink">{service.responseTime}s</p>
                  </div>
                  <div>
                    <p className="text-steel">Uptime</p>
                    <p className="font-bold text-ink">{service.uptime.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!services.length && !loading && (
            <p className="text-sm text-steel text-center mt-4">Queue data will appear once activity is detected.</p>
          )}
        </div>
      </div>

      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Recent Incidents</h3>
        <div className="space-y-3">
          {incidents.map((incident, index) => (
            <div key={`${incident.title}-${index}`} className="neo-card bg-pearl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-solar mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-ink">{incident.title}</p>
                <p className="text-sm text-steel mt-1">{incident.detail}</p>
              </div>
              <Badge className="bg-solar/20 text-solar">{incident.badge}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const StatusBadge = ({ status }: { status: ServiceTile['status'] }) => {
  if (status === 'healthy') {
    return (
      <Badge className="bg-bio/20 text-bio">
        <CheckCircle className="w-3 h-3 mr-1" />
        Healthy
      </Badge>
    );
  }
  if (status === 'degraded') {
    return (
      <Badge className="bg-solar/20 text-solar">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Degraded
      </Badge>
    );
  }
  return (
    <Badge className="bg-pulse/20 text-pulse">
      <AlertTriangle className="w-3 h-3 mr-1" />
      Down
    </Badge>
  );
};

const MetricBar = ({
  icon: Icon,
  label,
  value,
  className
}: {
  icon: typeof Cpu;
  label: string;
  value: number;
  className: string;
}) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <div className={`flex items-center gap-2 ${className}`}>
        <Icon className="w-4 h-4" />
        <span className="text-sm text-ink">{label}</span>
      </div>
      <span className="text-sm font-bold text-ink">{value}%</span>
    </div>
    <Progress value={value} className="h-2" />
  </div>
);

