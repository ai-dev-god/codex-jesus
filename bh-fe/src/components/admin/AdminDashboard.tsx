import { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  Database, 
  Shield, 
  Settings, 
  FileText,
  AlertTriangle,
  TrendingUp,
  Server,
  Lock,
  UserCog,
  BarChart3,
  Key,
  Brain,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth/AuthContext';
import { fetchSystemOverview, type SystemOverview as SystemOverviewResponse } from '../../lib/api/admin';
import { ApiError } from '../../lib/api/error';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import SystemHealthMonitor from './SystemHealthMonitor';
import DatabaseStatus from './DatabaseStatus';
import UserManagement from './UserManagement';
import ApplicationConfig from './ApplicationConfig';
import AuditLogs from './AuditLogs';
import SystemMetrics from './SystemMetrics';
import SecurityCenter from './SecurityCenter';
import BackupManagement from './BackupManagement';
import ApiKeyManagement from './ApiKeyManagement';
import LlmUsageTracking from './LlmUsageTracking';
import PrivacyCenter from './PrivacyCenter';

type AdminTab =
  | 'overview'
  | 'users'
  | 'health'
  | 'database'
  | 'config'
  | 'security'
  | 'privacy'
  | 'audit'
  | 'metrics'
  | 'backups'
  | 'apikeys'
  | 'llm';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  return (
    <div className="min-h-screen mesh-gradient py-12 px-6">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl gradient-neural flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="mb-3">Admin Control Panel</h1>
          <p className="text-xl text-steel">Super Administrator Dashboard</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTab)} className="space-y-8">
          {/* Tab Navigation */}
          <TabsList className="neo-card bg-white p-2 inline-flex gap-2 flex-wrap">
            <TabsTrigger value="overview" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="health" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Activity className="w-4 h-4 mr-2" />
              Health
            </TabsTrigger>
            <TabsTrigger value="database" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Database className="w-4 h-4 mr-2" />
              Database
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Settings className="w-4 h-4 mr-2" />
              Config
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Lock className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="privacy" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Shield className="w-4 h-4 mr-2" />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="apikeys" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Key className="w-4 h-4 mr-2" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="llm" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Brain className="w-4 h-4 mr-2" />
              LLM Usage
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <FileText className="w-4 h-4 mr-2" />
              Audit
            </TabsTrigger>
            <TabsTrigger value="metrics" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <BarChart3 className="w-4 h-4 mr-2" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="backups" className="data-[state=active]:gradient-electric data-[state=active]:text-white">
              <Server className="w-4 h-4 mr-2" />
              Backups
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="overview" className="space-y-8">
            <SystemOverview onNavigate={setActiveTab} />
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          <TabsContent value="health">
            <SystemHealthMonitor />
          </TabsContent>

          <TabsContent value="database">
            <DatabaseStatus />
          </TabsContent>

          <TabsContent value="config">
            <ApplicationConfig />
          </TabsContent>

          <TabsContent value="security">
            <SecurityCenter />
          </TabsContent>

          <TabsContent value="privacy">
            <PrivacyCenter />
          </TabsContent>

          <TabsContent value="apikeys">
            <ApiKeyManagement />
          </TabsContent>

          <TabsContent value="llm">
            <LlmUsageTracking />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogs />
          </TabsContent>

          <TabsContent value="metrics">
            <SystemMetrics />
          </TabsContent>

          <TabsContent value="backups">
            <BackupManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Overview Component
function SystemOverview({ onNavigate }: { onNavigate: (tab: AdminTab) => void }) {
  const { ensureAccessToken } = useAuth();
  const [overview, setOverview] = useState<SystemOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const loadOverview = useCallback(
    async (showToast = false) => {
      if (showToast) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const token = await ensureAccessToken();
        const data = await fetchSystemOverview(token);
        setOverview(data);
        setLastLoadedAt(new Date());
        if (showToast) {
          toast.success('Overview refreshed');
        }
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Unable to load system overview.';
        setError(message);
        if (showToast) {
          toast.error(message);
        }
      } finally {
        if (!showToast) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    [ensureAccessToken]
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const quickStats = overview?.quickStats ?? [];
  const recentActivity = overview?.recentActivity ?? [];
  const showSkeleton = loading && !overview;
  const formattedLastLoaded = useMemo(
    () => (lastLoadedAt ? formatRelativeTime(lastLoadedAt) : null),
    [lastLoadedAt]
  );

  const severityDotClass: Record<'info' | 'success' | 'warning' | 'error', string> = {
    info: 'bg-electric',
    success: 'bg-bio',
    warning: 'bg-neural',
    error: 'bg-pulse'
  };

  const resolveStatPresentation = (label: string) => {
    const normalized = label.toLowerCase();
    if (normalized.includes('user')) {
      return { Icon: Users, gradient: 'bio' as const };
    }
    if (normalized.includes('backup') || normalized.includes('database')) {
      return { Icon: Database, gradient: 'electric' as const };
    }
    if (normalized.includes('health') || normalized.includes('session')) {
      return { Icon: Activity, gradient: 'pulse' as const };
    }
    if (normalized.includes('alert') || normalized.includes('pending')) {
      return { Icon: AlertTriangle, gradient: 'neural' as const };
    }
    return { Icon: TrendingUp, gradient: 'electric' as const };
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-ink mb-1">Platform Snapshot</h3>
          <p className="text-sm text-steel">
            {formattedLastLoaded ? `Last updated ${formattedLastLoaded}` : 'Fetching latest stats…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-pulse">{error}</span>}
          <Button variant="outline" size="sm" onClick={() => void loadOverview(true)} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && !overview && (
        <div className="rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {showSkeleton
          ? Array.from({ length: 4 }).map((_, idx) => (
              <div key={`stat-skeleton-${idx}`} className="neo-card bg-white p-6 animate-pulse">
                <div className="h-4 w-20 rounded bg-cloud mb-3" />
                <div className="h-8 w-24 rounded bg-cloud mb-2" />
                <div className="h-3 w-16 rounded bg-cloud" />
              </div>
            ))
          : quickStats.length === 0
            ? (
              <div className="neo-card bg-white p-6 text-sm text-steel md:col-span-2 lg:col-span-4">
                No overview metrics available yet.
              </div>
            )
            : quickStats.map((stat, idx) => {
                const { Icon, gradient } = resolveStatPresentation(stat.label);
                return (
                  <div key={`${stat.label}-${idx}`} className="neo-card bg-white p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <p className="tag text-steel">{stat.label}</p>
                        <p className="text-3xl font-bold text-ink">{stat.value}</p>
                        <p
                          className={`text-sm ${
                            stat.trend === 'up'
                              ? 'text-bio'
                              : stat.trend === 'down'
                                ? 'text-pulse'
                                : 'text-electric'
                          }`}
                        >
                          {stat.change}
                        </p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl gradient-${gradient} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  </div>
                );
              })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neo-card bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3>Recent System Activity</h3>
          </div>
          <div className="space-y-3">
            {showSkeleton
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`activity-skeleton-${idx}`} className="neo-card bg-pearl p-4 animate-pulse">
                    <div className="h-4 w-40 rounded bg-cloud mb-2" />
                    <div className="h-3 w-24 rounded bg-cloud" />
                  </div>
                ))
              : recentActivity.length === 0
                ? (
                  <p className="text-sm text-steel">No recent admin activity recorded.</p>
                )
                : recentActivity.map((activity, idx) => (
                    <div key={`${activity.action}-${idx}`} className="neo-card bg-pearl p-4 flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 ${severityDotClass[activity.severity]}`} />
                      <div className="flex-1">
                        <p className="font-medium text-ink">{activity.action}</p>
                        <p className="text-sm text-steel">{formatRelativeTime(activity.time)}</p>
                      </div>
                    </div>
                  ))}
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="neo-card bg-pearl hover:bg-cloud transition-all p-4 text-left"
              onClick={() => onNavigate('users')}
            >
              <UserCog className="w-6 h-6 text-electric mb-2" />
              <p className="font-bold text-ink">Manage Users</p>
            </button>
            <button
              className="neo-card bg-pearl hover:bg-cloud transition-all p-4 text-left"
              onClick={() => onNavigate('backups')}
            >
              <Database className="w-6 h-6 text-bio mb-2" />
              <p className="font-bold text-ink">Run Backup</p>
            </button>
            <button
              className="neo-card bg-pearl hover:bg-cloud transition-all p-4 text-left"
              onClick={() => onNavigate('health')}
            >
              <Activity className="w-6 h-6 text-pulse mb-2" />
              <p className="font-bold text-ink">Health Check</p>
            </button>
            <button
              className="neo-card bg-pearl hover:bg-cloud transition-all p-4 text-left"
              onClick={() => onNavigate('security')}
            >
              <Lock className="w-6 h-6 text-neural mb-2" />
              <p className="font-bold text-ink">Security Triage</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const formatRelativeTime = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : 'Unknown';
  }

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'Just now';
  }
  if (diffMs < hour) {
    const minutes = Math.floor(diffMs / minute);
    return `${minutes}m ago`;
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `${hours}h ago`;
  }
  if (diffMs < day * 7) {
    const days = Math.floor(diffMs / day);
    return `${days}d ago`;
  }
  return date.toLocaleString();
};