import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Brain, CheckCircle, DollarSign, RefreshCcw, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import {
  fetchLlmUsageMetrics,
  type LlmEngineMetric,
  type LlmFeatureUsageMetric,
  type LlmUsageMetricsResponse
} from '../../lib/api/admin';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

const FEATURE_COLORS = ['var(--electric)', 'var(--bio)', 'var(--neural)', 'var(--pulse)'];
const MONTHLY_BUDGET_USD = 20_000;

export default function LlmUsageTracking() {
  const { ensureAccessToken } = useAuth();
  const [metrics, setMetrics] = useState<LlmUsageMetricsResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(
    async (showToast = false) => {
      if (!showToast) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const token = await ensureAccessToken();
        const data = await fetchLlmUsageMetrics(token, 7);
        setMetrics(data);
        if (showToast) {
          toast.success('LLM metrics refreshed');
        }
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Unable to load LLM metrics right now.';
        setError(message);
        if (showToast) {
          toast.error(message);
        }
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [ensureAccessToken]
  );

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  if (!metrics && initialLoading) {
    return (
      <div className="neo-card bg-white p-6 text-steel text-sm">
        Loading LLM telemetry…
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="neo-card bg-white p-6 space-y-4">
        <p className="text-solar font-semibold">Unable to load LLM metrics</p>
        <p className="text-sm text-steel">{error ?? 'Please try again in a moment.'}</p>
        <Button onClick={() => void loadMetrics()} variant="outline" className="w-fit">
          Retry
        </Button>
      </div>
    );
  }

  const openchatEngine = metrics.engines.find((engine) => engine.id === 'OPENCHAT_5');
  const geminiEngine = metrics.engines.find((engine) => engine.id === 'GEMINI_2_5_PRO');
  const legacyEngine = metrics.engines.find((engine) => engine.id === 'OPENBIO_LLM');

  const totalRequests = metrics.summary.totalRequests;
  const totalCost = metrics.summary.totalCostUsd;
  const totalTokens = metrics.summary.totalTokens;
  const successRate = metrics.summary.successRate;
  const avgLatency = metrics.summary.avgLatencyMs;
  const costPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;
  const projectedMonthlyCost = totalCost * (30 / metrics.windowDays);
  const budgetUtilization =
    MONTHLY_BUDGET_USD > 0 ? Math.min(100, (totalCost / MONTHLY_BUDGET_USD) * 100) : 0;

  const usageChartData = useMemo(() => {
    return metrics.timeline.usage.map((point) => ({
      date: formatDateLabel(point.date),
      openchat: point.engines.OPENCHAT_5 ?? 0,
      gemini: point.engines.GEMINI_2_5_PRO ?? 0
    }));
  }, [metrics.timeline.usage]);

  const costChartData = useMemo(() => {
    return metrics.timeline.cost.map((point) => ({
      date: formatDateLabel(point.date),
      openchat: roundCurrency(point.engines.OPENCHAT_5 ?? 0, 4),
      gemini: roundCurrency(point.engines.GEMINI_2_5_PRO ?? 0, 4)
    }));
  }, [metrics.timeline.cost]);

  const featureUsage = metrics.featureUsage;

  const openchatLatency = openchatEngine?.avgLatencyMs ?? null;
  const geminiLatency = geminiEngine?.avgLatencyMs ?? null;
  const latencyRatio =
    openchatLatency && geminiLatency && geminiLatency > 0
      ? Number((geminiLatency / openchatLatency).toFixed(1))
      : null;
  const failureRate = 1 - successRate;

  const lastUpdated = formatTimestamp(metrics.generatedAt);

  return (
    <div className="space-y-6">
      {error && (
        <ErrorBanner message={error} onRetry={() => void loadMetrics(true)} refreshing={refreshing} />
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="tag text-steel mb-1">Dual-engine telemetry</p>
          <h3 className="text-2xl font-semibold text-ink">LLM Usage (last {metrics.windowDays} days)</h3>
          <p className="text-xs text-steel">Last updated {lastUpdated}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadMetrics(true)} disabled={refreshing}>
          {refreshing ? (
            <span className="flex items-center gap-2">
              <RefreshCcw className="w-4 h-4 animate-spin" /> Refreshing…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <RefreshCcw className="w-4 h-4" /> Refresh
            </span>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <OverviewCard
          icon={<Brain className="w-5 h-5 text-white" />}
          label="Total Requests"
          value={formatNumber(totalRequests)}
          helper="Rolling window"
          gradient="gradient-electric"
        />
        <OverviewCard
          icon={<DollarSign className="w-5 h-5 text-white" />}
          label="Total Cost"
          value={formatCurrency(totalCost)}
          helper={`${formatDelta(costChartData)} vs day 1`}
          gradient="gradient-bio"
        />
        <OverviewCard
          icon={<Zap className="w-5 h-5 text-white" />}
          label="Avg Latency"
          value={avgLatency ? `${Math.round(avgLatency)}ms` : '—'}
          helper="Dual-engine orchestration"
          gradient="gradient-neural"
        />
        <OverviewCard
          icon={<TrendingUp className="w-5 h-5 text-white" />}
          label="Success Rate"
          value={percentFromRate(successRate)}
          helper={`${percentFromRate(failureRate)} failure rate`}
          gradient="gradient-pulse"
        />
      </div>

      <Tabs defaultValue="usage" className="space-y-6">
        <TabsList className="neo-card bg-white p-2 flex flex-wrap">
          <TabsTrigger value="usage">Usage Metrics</TabsTrigger>
          <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="features">Feature Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Daily Requests</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
                <XAxis dataKey="date" stroke="var(--steel)" />
                <YAxis stroke="var(--steel)" />
                <Tooltip contentStyle={tooltipStyles} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="openchat"
                  stroke="var(--electric)"
                  strokeWidth={3}
                  name="OpenChat 5"
                  dot={{ fill: 'var(--electric)', r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="gemini"
                  stroke="var(--bio)"
                  strokeWidth={3}
                  name="Gemini 2.5 Pro"
                  dot={{ fill: 'var(--bio)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {openchatEngine && (
              <EngineStatsCard engine={openchatEngine} accent="electric" totalRequests={totalRequests} />
            )}
            {geminiEngine && (
              <EngineStatsCard engine={geminiEngine} accent="bio" totalRequests={totalRequests} />
            )}
          </div>

          {legacyEngine && legacyEngine.status === 'DECOMMISSIONED' && (
            <LegacyEngineBanner engine={legacyEngine} />
          )}
        </TabsContent>

        <TabsContent value="cost" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Daily Cost Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
                <XAxis dataKey="date" stroke="var(--steel)" />
                <YAxis stroke="var(--steel)" />
                <Tooltip
                  contentStyle={tooltipStyles}
                  formatter={(value: number) => formatCurrency(value as number)}
                />
                <Legend />
                <Bar dataKey="openchat" fill="var(--electric)" name="OpenChat 5" radius={[8, 8, 0, 0]} />
                <Bar dataKey="gemini" fill="var(--bio)" name="Gemini 2.5 Pro" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SummaryTile label="Current Window Spend" value={formatCurrency(totalCost)} helper="Across both engines" />
            <SummaryTile label="Projected Monthly Spend" value={formatCurrency(projectedMonthlyCost)} helper="30-day projection" />
            <SummaryTile label="Cost per Request" value={formatCurrency(costPerRequest)} helper="Blended average" />
          </div>

          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Budget Monitor</h3>
            <div className="neo-card bg-pearl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-ink">Within monthly budget</p>
                <p className="text-sm text-steel mt-1">
                  {formatCurrency(totalCost)} of {formatCurrency(MONTHLY_BUDGET_USD)} consumed
                </p>
                <Progress value={budgetUtilization} className="h-2 mt-2" />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Response Times</h3>
              <div className="space-y-4">
                <LatencyRow label="OpenChat 5" value={openchatLatency} color="bg-electric" />
                <LatencyRow label="Gemini 2.5 Pro" value={geminiLatency} color="bg-bio" />
              </div>

              <div className="mt-6 pt-4 border-t border-cloud">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-bio" />
                  <p className="text-sm font-medium text-ink">
                    {latencyRatio ? `Gemini is ${latencyRatio}x slower` : 'Stable dual-engine latency'}
                  </p>
                </div>
                <p className="text-xs text-steel">
                  Route bursty or low-latency workloads to OpenChat 5 for faster completion.
                </p>
              </div>
            </div>

            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Success Rate</h3>
              <div className="space-y-4">
                {[openchatEngine, geminiEngine].filter(Boolean).map((engine) => (
                  <div key={engine!.id} className="neo-card bg-pearl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-ink">{engine!.label}</span>
                      <Badge className="bg-bio/15 text-bio">{percentFromRate(engine!.successRate)}</Badge>
                    </div>
                    <p className="text-xs text-steel">
                      {formatNumber(Math.max(0, Math.round(engine!.requests * failureRate)))} failed requests
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-cloud">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-bio" />
                  <p className="text-sm font-medium text-ink">Failover rate remains low</p>
                </div>
                <p className="text-xs text-steel">
                  Keep cloud tasks under 60s to maintain current retry behaviour.
                </p>
              </div>
            </div>
          </div>

          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Performance Recommendations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RecommendationCard
                icon={<Zap className="w-5 h-5 text-electric" />}
                title="Optimize routing"
                description="Send real-time nudge workflows to OpenChat 5 for sub-200ms responses."
              />
              <RecommendationCard
                icon={<DollarSign className="w-5 h-5 text-bio" />}
                title="Cache recurring prompts"
                description="Caching top prompts can trim OpenRouter spend by ~30%."
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">AI Usage by Feature</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={featureUsage} dataKey="percentage" nameKey="label" cx="50%" cy="50%" outerRadius={85}>
                    {featureUsage.map((feature, index) => (
                      <Cell
                        key={`feature-${feature.id}`}
                        fill={FEATURE_COLORS[index % FEATURE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyles} formatter={(value: number, name: string) => [`${value}%`, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Top Features</h3>
              <div className="space-y-3">
                {featureUsage.map((feature) => (
                  <div key={feature.id} className="neo-card bg-pearl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-ink">{feature.label}</span>
                      <span className="text-sm font-bold text-ink">
                        {feature.percentage}% · {formatNumber(feature.requestCount)}
                      </span>
                    </div>
                    <Progress value={feature.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EngineStatsCard({
  engine,
  accent,
  totalRequests
}: {
  engine: LlmEngineMetric;
  accent: 'electric' | 'bio';
  totalRequests: number;
}) {
  const gradient = accent === 'electric' ? 'gradient-electric' : 'gradient-bio';
  const accentColor = accent === 'electric' ? 'var(--electric)' : 'var(--bio)';
  const sharePercent = Math.min(100, engine.requestShare * 100);
  return (
    <div className="neo-card bg-white p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl ${gradient} flex items-center justify-center shadow-lg`}>
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3>{engine.label}</h3>
          <p className="text-sm text-steel">{engine.model ?? 'OpenRouter'}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-steel">Requests</span>
            <span className="text-sm font-bold text-ink">{formatNumber(engine.requests)}</span>
          </div>
          <Progress value={sharePercent} className="h-2" />
          <p className="text-xs text-steel mt-1">
            {sharePercent.toFixed(1)}% of {formatNumber(totalRequests)} requests
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cloud">
          <MetricDatum label="Tokens used" value={formatTokens(engine.tokens)} />
          <MetricDatum label="Avg latency" value={engine.avgLatencyMs ? `${Math.round(engine.avgLatencyMs)}ms` : '—'} />
          <MetricDatum label="Success rate" value={percentFromRate(engine.successRate)} accentColor={accentColor} />
          <MetricDatum label="Cost" value={formatCurrency(engine.costUsd)} />
        </div>
      </div>
    </div>
  );
}

function LegacyEngineBanner({ engine }: { engine: LlmEngineMetric }) {
  return (
    <div className="neo-card bg-cloud p-4 border border-dashed border-steel/40 text-steel flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 mt-1" />
      <div>
        <p className="font-semibold">OpenBioLLM offline</p>
        <p className="text-sm">
          Legacy engine {engine.label} remains greyed out while Gemini 2.5 Pro and OpenChat 5 handle all traffic through OpenRouter.
        </p>
      </div>
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
  refreshing
}: {
  message: string;
  onRetry: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="neo-card bg-solar/10 border border-solar/30 p-4 flex items-start gap-3 text-solar">
      <AlertTriangle className="w-5 h-5 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold">Telemetry degraded</p>
        <p className="text-sm">{message}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onRetry} disabled={refreshing}>
        Retry
      </Button>
    </div>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  helper,
  gradient
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  gradient: string;
}) {
  return (
    <div className="neo-card bg-white p-6">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${gradient} flex items-center justify-center shadow-lg`}>{icon}</div>
        <div>
          <p className="tag text-steel">{label}</p>
          <p className="text-2xl font-bold text-ink">{value}</p>
          <p className="text-xs text-steel">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="neo-card bg-white p-6">
      <p className="tag text-steel mb-2">{label}</p>
      <p className="text-3xl font-bold text-ink">{value}</p>
      <p className="text-sm text-steel mt-1">{helper}</p>
    </div>
  );
}

function RecommendationCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="neo-card bg-pearl p-4 flex items-start gap-3">
      {icon}
      <div>
        <p className="font-medium text-ink mb-1">{title}</p>
        <p className="text-sm text-steel">{description}</p>
      </div>
    </div>
  );
}

function MetricDatum({ label, value, accentColor }: { label: string; value: string; accentColor?: string }) {
  return (
    <div>
      <p className="text-xs text-steel">{label}</p>
      <p className="font-bold text-ink" style={accentColor ? { color: accentColor } : undefined}>
        {value}
      </p>
    </div>
  );
}

function LatencyRow({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded ${color}`} />
          <span className="text-sm text-ink">{label}</span>
        </div>
        <span className="text-sm font-bold text-ink">{value ? `${Math.round(value)}ms` : '—'}</span>
      </div>
      <Progress value={value ? Math.min(100, (2000 / value) * 10) : 0} className="h-2" />
    </div>
  );
}

const tooltipStyles = {
  backgroundColor: 'var(--pure)',
  border: '2px solid var(--cloud)',
  borderRadius: '8px'
};

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const formatDateLabel = (dateString: string): string => DATE_FORMATTER.format(new Date(dateString));
const formatTimestamp = (value: string): string => TIMESTAMP_FORMATTER.format(new Date(value));
const formatCurrency = (value: number): string =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatNumber = (value: number): string => value.toLocaleString();
const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
};
const percentFromRate = (rate: number): string => `${(rate * 100).toFixed(1)}%`;
const roundCurrency = (value: number, precision = 4): number => Number(value.toFixed(precision));

const formatDelta = (costPoints: Array<{ openchat: number; gemini: number }>): string => {
  if (costPoints.length < 2) {
    return 'vs previous';
  }
  const first = costPoints[0].openchat + costPoints[0].gemini;
  const last = costPoints[costPoints.length - 1].openchat + costPoints[costPoints.length - 1].gemini;
  if (first === 0) {
    return last > 0 ? '+100%' : '0%';
  }
  const delta = ((last - first) / first) * 100;
  const formatted = delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`;
  return formatted;
};
