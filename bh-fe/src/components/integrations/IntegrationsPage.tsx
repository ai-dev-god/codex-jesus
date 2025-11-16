import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  Check,
  Dna,
  FileText,
  Heart,
  Link2,
  Loader2,
  Microscope,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  X
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import { getWhoopStatus, requestWhoopLink, unlinkWhoop, type WhoopLinkStatus } from '../../lib/api/whoop';
import { getGymOverview, syncGymWorkouts, type GymOverview } from '../../lib/api/gym';

type IntegrationCategory = 'Wearable' | 'Lab Testing' | 'Epigenetic' | 'Microbiome' | 'Health Platforms';

type IntegrationDefinition = {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  icon: LucideIcon;
  metrics: string[];
  color: 'pulse' | 'neural' | 'bio' | 'solar' | 'electric';
  dataPoints?: string;
  practitionerEdited?: boolean;
  premium?: boolean;
  platforms?: string[];
  comingSoon?: boolean;
};

const integrationDefinitions: IntegrationDefinition[] = [
  {
    id: 'whoop',
    name: 'WHOOP',
    category: 'Wearable',
    description: 'Advanced recovery and strain tracking',
    icon: Activity,
    metrics: ['HRV', 'Recovery Score', 'Strain', 'Sleep Performance', 'Respiratory Rate'],
    color: 'pulse',
    dataPoints: 'Real-time recovery telemetry'
  },
  {
    id: 'biomarker-panel',
    name: 'Practitioner Biomarker Panel',
    category: 'Lab Testing',
    description: 'Practitioner-managed custom biomarker panels',
    icon: Microscope,
    metrics: ['Metabolic Markers', 'Hormones', 'Inflammation', 'Thyroid', 'Renal & Liver'],
    color: 'neural',
    comingSoon: true,
    practitionerEdited: true
  },
  {
    id: 'trueage',
    name: 'TruAge Testing (TruDiagnostic)',
    category: 'Epigenetic',
    description: '1M+ methylation sites analyzed for organ-specific age',
    icon: Dna,
    metrics: ['Biological Age', 'Immune Age', 'Pace of Aging', 'Brain Age'],
    color: 'bio',
    comingSoon: true,
    premium: true
  },
  {
    id: 'gi-effects',
    name: 'Geneva GI Effects Test',
    category: 'Microbiome',
    description: 'Advanced gut diagnostics covering five biomarker systems',
    icon: Heart,
    metrics: ['Maldigestion', 'Inflammation', 'Dysbiosis', 'Metabolites', 'Pathogens'],
    color: 'solar',
    comingSoon: true,
    premium: true
  },
  {
    id: 'health-platforms',
    name: 'Google Health Connect & Apple Health',
    category: 'Health Platforms',
    description: 'Unified smartphone health data (steps, workouts, sleep)',
    icon: Smartphone,
    metrics: ['Steps', 'Heart Rate', 'Workouts', 'Active Energy'],
    color: 'electric',
    platforms: ['Google Health Connect', 'Apple Health'],
    comingSoon: true
  }
];

export default function IntegrationsPage() {
  const { ensureAccessToken } = useAuth();
  const [whoopStatus, setWhoopStatus] = useState<WhoopLinkStatus | null>(null);
  const [gymOverview, setGymOverview] = useState<GymOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntegrationData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const [status, overview] = await Promise.all([
        getWhoopStatus(token),
        getGymOverview(token).catch((err) => {
          if (err instanceof ApiError) {
            return null;
          }
          throw err;
        })
      ]);
      setWhoopStatus(status);
      setGymOverview(overview);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to load integration data right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void fetchIntegrationData();
  }, [fetchIntegrationData]);

  const connectedCount = useMemo(() => (whoopStatus?.linked ? 1 : 0), [whoopStatus]);

  const lastSyncLabel = useMemo(() => {
    if (!whoopStatus?.linked) {
      return whoopStatus ? 'Not linked' : loading ? '—' : 'Not linked';
    }
    if (!whoopStatus.lastSyncAt) {
      return 'Awaiting first sync';
    }
    return new Date(whoopStatus.lastSyncAt).toLocaleString();
  }, [whoopStatus, loading]);

  const whoopSubtitle = useMemo(() => {
    if (loading) {
      return 'Checking your WHOOP status…';
    }
    if (whoopStatus?.linked) {
      return whoopStatus.lastSyncAt
        ? `Last sync ${new Date(whoopStatus.lastSyncAt).toLocaleString()}`
        : 'Linked • waiting for first sync';
    }
    if (whoopStatus && !whoopStatus.linkUrl) {
      return 'WHOOP is not configured for this environment.';
    }
    return 'Connect WHOOP to sync recovery and strain metrics.';
  }, [whoopStatus, loading]);

  const whoopMetrics = useMemo(() => {
    if (!gymOverview) {
      return integrationDefinitions.find((integration) => integration.id === 'whoop')?.metrics ?? [];
    }
    const { metrics } = gymOverview;
    return [
      `Sessions (7d): ${metrics.totalWorkouts7d}`,
      `Avg Duration: ${metrics.avgDurationMinutes7d ?? '—'} min`,
      `Avg Strain: ${metrics.avgStrain7d ?? '—'}`,
      `Calories: ${metrics.totalCalories7d?.toLocaleString() ?? '—'}`
    ];
  }, [gymOverview]);

  const handleWhoopConnect = useCallback(async () => {
    setActionLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const status = await requestWhoopLink(token);
      setWhoopStatus(status);
      if (status.linkUrl) {
        window.location.href = status.linkUrl;
        return;
      }
      if (status.linked) {
        toast.success('WHOOP is already linked.');
      } else {
        toast.info('WHOOP linking is not available in this environment.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to start the WHOOP linking flow.');
      }
    } finally {
      setActionLoading(false);
    }
  }, [ensureAccessToken]);

  const handleWhoopDisconnect = useCallback(async () => {
    setActionLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      await unlinkWhoop(token);
      toast.success('WHOOP integration disconnected.');
      await fetchIntegrationData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to disconnect WHOOP right now.');
      }
    } finally {
      setActionLoading(false);
    }
  }, [ensureAccessToken, fetchIntegrationData]);

  const handleManualSync = useCallback(async () => {
    setSyncLoading(true);
    try {
      const token = await ensureAccessToken();
      await syncGymWorkouts(token);
      toast.success('Manual WHOOP sync triggered.');
      await fetchIntegrationData();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to enqueue a WHOOP sync.');
      }
    } finally {
      setSyncLoading(false);
    }
  }, [ensureAccessToken, fetchIntegrationData]);

  const handleNavigateToGym = useCallback(() => {
    window.dispatchEvent(new CustomEvent('biohax:navigate', { detail: 'gym' }));
    toast.success('Opening the Gym view…');
  }, []);

  const handleRefreshStatus = useCallback(() => {
    void fetchIntegrationData();
  }, [fetchIntegrationData]);

  const renderIntegrationCard = (integration: IntegrationDefinition) => {
    const Icon = integration.icon;
    const isWhoop = integration.id === 'whoop';
    const comingSoon = integration.comingSoon && !isWhoop;
    const isConnected = isWhoop ? Boolean(whoopStatus?.linked) : false;
    const cardClass = isConnected ? `neo-card-${integration.color}` : 'neo-card';
    const gradientClass = `gradient-${integration.color}`;
    const metrics = isWhoop ? whoopMetrics : integration.metrics;

    return (
      <div key={integration.id} className={`${cardClass} p-8 hover:scale-[1.01] transition-transform`}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex items-start gap-4 flex-1">
            <div className={`w-16 h-16 rounded-2xl ${gradientClass} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-8 h-8 text-void" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h3>{integration.name}</h3>
                {comingSoon && <Badge variant="secondary">Coming Soon</Badge>}
                {isWhoop && whoopStatus?.linked && (
                  <Badge variant="success">
                    <Check className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                )}
                {integration.practitionerEdited && (
                  <Badge className="bg-electric text-void">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Practitioner Managed
                  </Badge>
                )}
                {integration.premium && (
                  <Badge className="bg-gradient-to-r from-neural to-bio text-white">
                    <Star className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                )}
              </div>
              <p className="text-ink mb-3">{isWhoop ? whoopSubtitle : integration.description}</p>
              {isWhoop && gymOverview?.lastSyncAt && (
                <p className="text-sm text-steel mb-4">
                  <span className="font-semibold">WHOOP sync status:</span> {gymOverview.syncStatus}
                </p>
              )}
              {integration.platforms && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {integration.platforms.map((platform) => (
                    <span key={platform} className="px-4 py-2 bg-white rounded-xl text-sm font-semibold text-ink border border-cloud">
                      {platform}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {metrics.map((metric) => (
                  <span key={metric} className="px-3 py-1.5 bg-white rounded-lg text-xs font-semibold text-ink border border-cloud">
                    {metric}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 lg:flex-col lg:items-end">
            {isWhoop ? (
              <>
                <Button variant="outline" onClick={handleRefreshStatus} disabled={loading || actionLoading}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Status
                </Button>
                {whoopStatus?.linked ? (
                  <>
                    <Button variant="outline" onClick={handleManualSync} disabled={syncLoading}>
                      {syncLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Syncing…
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sync Now
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleNavigateToGym}>
                      View Data
                    </Button>
                    <Button
                      variant="outline"
                      className="text-pulse border-pulse/20 hover:bg-pulse/10"
                      onClick={handleWhoopDisconnect}
                      disabled={actionLoading}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleWhoopConnect} disabled={actionLoading || loading}>
                    {actionLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        Connect WHOOP
                      </>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <Button variant="outline" disabled className="cursor-not-allowed opacity-70">
                Coming Soon
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen mesh-gradient py-12 px-6" data-testid="view-integrations">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="tag text-steel mb-3">INTEGRATIONS</div>
            <h2 className="mb-4">Connected data sources</h2>
            <p className="text-xl text-steel max-w-2xl">
              Manage your wearables, manual lab pipelines, and precision diagnostics. WHOOP is live today—everything else is queued for release.
            </p>
          </div>
          <Button size="lg" variant="outline" disabled className="opacity-70 cursor-not-allowed">
            More integrations coming soon
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-pulse/40 bg-pulse/10 px-4 py-3 text-sm text-pulse">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="neo-card-electric p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-electric flex items-center justify-center">
                <Activity className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">ACTIVE INTEGRATIONS</div>
                <div className="text-4xl font-bold text-ink">{loading ? '—' : connectedCount}</div>
              </div>
            </div>
            <p className="text-sm text-steel">WHOOP is currently the only live wearable.</p>
          </div>

          <div className="neo-card-neural p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-neural flex items-center justify-center">
                <FileText className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">DATA SOURCES</div>
                <div className="text-4xl font-bold text-ink">150+</div>
              </div>
            </div>
            <p className="text-sm text-steel">Biomarkers tracked across lab uploads and wearables.</p>
          </div>

          <div className="neo-card-bio p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-bio flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">LAST WHOOP SYNC</div>
                <div className="text-2xl font-bold text-ink">{lastSyncLabel}</div>
              </div>
            </div>
            <p className="text-sm text-steel">
              Sync status: {whoopStatus?.syncStatus ?? 'NOT_LINKED'}
            </p>
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Integrations</TabsTrigger>
            <TabsTrigger value="wearables">Wearables</TabsTrigger>
            <TabsTrigger value="labs">Lab Testing</TabsTrigger>
            <TabsTrigger value="api">API Access</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-8 space-y-6">
            {integrationDefinitions.map(renderIntegrationCard)}
            <div className="neo-card p-12 w-full hover:scale-[1.01] transition-transform text-center border-dashed">
              <Link2 className="w-12 h-12 text-steel mx-auto mb-4" />
              <h4 className="mb-2">Add Another Integration</h4>
              <p className="text-steel mb-6 max-w-md mx-auto">
                We are actively onboarding additional wearables and specialty diagnostics. Reach out if you have a priority request.
              </p>
              <Button variant="outline" disabled className="opacity-70 cursor-not-allowed">
                Coming Soon
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="wearables" className="mt-8 space-y-6">
            {integrationDefinitions
              .filter((integration) => integration.category === 'Wearable' || integration.category === 'Health Platforms')
              .map(renderIntegrationCard)}
          </TabsContent>

          <TabsContent value="labs" className="mt-8 space-y-6">
            {integrationDefinitions
              .filter((integration) => integration.category === 'Lab Testing' || integration.category === 'Epigenetic' || integration.category === 'Microbiome')
              .map(renderIntegrationCard)}

            <div className="neo-card-electric p-8">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-electric flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h4 className="mb-2">Manual Uploads Available Today</h4>
                  <p className="text-steel mb-6">
                    Use the Lab Uploads workspace to ingest PDFs, CSV exports, or high-resolution images. Dual-engine AI parses 150+ biomarkers automatically.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button>Upload Lab Results</Button>
                    <Button variant="outline">Request Practitioner Panel</Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="api" className="mt-8 space-y-6">
            <div className="neo-card p-8">
              <h3 className="mb-4">API Access</h3>
              <p className="text-steel mb-8">
                REST access for enterprise partners is rolling out next. Endpoints are stabilized internally and will be exposed once IAM policies are finalized.
              </p>

              <div className="p-6 rounded-2xl bg-pearl border-2 border-cloud mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h4>API Key</h4>
                  <Button variant="outline" disabled>
                    Regenerate
                  </Button>
                </div>
                <code className="block p-4 rounded-xl bg-white border-2 border-cloud font-mono text-sm text-ink">coming_soon_enable_at_launch</code>
              </div>

              <div className="mb-8">
                <h4 className="mb-4">Internal Endpoints (Preview)</h4>
                <ul className="space-y-2 text-steel">
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>GET /api/v1/gym/overview — feeds the Gym view (WHOOP workouts)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>POST /api/v1/gym/sync — queues a WHOOP sync job</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>GET /api/v1/whoop/status — exposes OAuth state + sync metadata</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" disabled className="opacity-70 cursor-not-allowed">
                  API Docs (Coming Soon)
                </Button>
                <Button variant="outline" disabled className="opacity-70 cursor-not-allowed">
                  API Playground
                </Button>
              </div>
            </div>

            <div className="neo-card-bio p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl gradient-bio flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-void" />
                </div>
                <div>
                  <h4 className="mb-2">HIPAA & SOC 2</h4>
                  <p className="text-steel">
                    All backend calls route through Google Cloud Run in project <strong>biohax-777</strong>. Traffic is encrypted, logged, and scoped with IAM.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

