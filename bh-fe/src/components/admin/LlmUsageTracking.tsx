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

  const chatgptEngine = metrics.engines.find((engine) => engine.id === 'CHATGPT_5');
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
      chatgpt: point.engines.CHATGPT_5 ?? 0,
      gemini: point.engines.GEMINI_2_5_PRO ?? 0
    }));
  }, [metrics.timeline.usage]);

  const costChartData = useMemo(() => {
    return metrics.timeline.cost.map((point) => ({
      date: formatDateLabel(point.date),
      chatgpt: roundCurrency(point.engines.CHATGPT_5 ?? 0, 4),
      gemini: roundCurrency(point.engines.GEMINI_2_5_PRO ?? 0, 4)
    }));
  }, [metrics.timeline.cost]);

  const featureUsage = metrics.featureUsage;

  const chatgptLatency = chatgptEngine?.avgLatencyMs ?? null;
  const geminiLatency = geminiEngine?.avgLatencyMs ?? null;
  const latencyRatio =
    chatgptLatency && geminiLatency && geminiLatency > 0
      ? Number((geminiLatency / chatgptLatency).toFixed(1))
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
                  dataKey="chatgpt"
                  stroke="var(--electric)"
                  strokeWidth={3}
                  name="ChatGPT 5"
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
            {chatgptEngine && (
              <EngineStatsCard engine={chatgptEngine} accent="electric" totalRequests={totalRequests} />
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
                <Bar dataKey="chatgpt" fill="var(--electric)" name="ChatGPT 5" radius={[8, 8, 0, 0]} />
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
                <LatencyRow label="ChatGPT 5" value={chatgptLatency} color="bg-electric" />
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
                  Route bursty or low-latency workloads to ChatGPT 5 for faster completion.
                </p>
              </div>
            </div>

            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Success Rate</h3>
              <div className="space-y-4">
                {[chatgptEngine, geminiEngine].filter(Boolean).map((engine) => (
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
                description="Send real-time nudge workflows to ChatGPT 5 for sub-200ms responses."
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
          Legacy engine {engine.label} remains greyed out while Gemini 2.5 Pro and ChatGPT 5 handle all traffic through OpenRouter.
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

const formatDelta = (costPoints: Array<{ chatgpt: number; gemini: number }>): string => {
  if (costPoints.length < 2) {
    return 'vs previous';
  }
  const first = costPoints[0].chatgpt + costPoints[0].gemini;
  const last = costPoints[costPoints.length - 1].chatgpt + costPoints[costPoints.length - 1].gemini;
  if (first === 0) {
    return last > 0 ? '+100%' : '0%';
  }
  const delta = ((last - first) / first) * 100;
  const formatted = delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`;
  return formatted;
};
import { Brain, TrendingUp, DollarSign, Zap, CheckCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export default function LlmUsageTracking() {
  const usageData = [
    { date: 'Nov 9', openBio: 12847, gemini: 8234 },
    { date: 'Nov 10', openBio: 14523, gemini: 9156 },
    { date: 'Nov 11', openBio: 13891, gemini: 8942 },
    { date: 'Nov 12', openBio: 15234, gemini: 9876 },
    { date: 'Nov 13', openBio: 16789, gemini: 10234 },
    { date: 'Nov 14', openBio: 15432, gemini: 9658 },
    { date: 'Nov 15', openBio: 17234, gemini: 10892 },
  ];

  const costData = [
    { date: 'Nov 9', openBio: 256.94, gemini: 164.68 },
    { date: 'Nov 10', openBio: 290.46, gemini: 183.12 },
    { date: 'Nov 11', openBio: 277.82, gemini: 178.84 },
    { date: 'Nov 12', openBio: 304.68, gemini: 197.52 },
    { date: 'Nov 13', openBio: 335.78, gemini: 204.68 },
    { date: 'Nov 14', openBio: 308.64, gemini: 193.16 },
    { date: 'Nov 15', openBio: 344.68, gemini: 217.84 },
  ];

  const featureUsage = [
    { name: 'Protocol Generation', value: 42.3, color: 'var(--electric)' },
    { name: 'Biomarker Analysis', value: 28.7, color: 'var(--bio)' },
    { name: 'Recommendations', value: 18.2, color: 'var(--neural)' },
    { name: 'Data Interpretation', value: 10.8, color: 'var(--pulse)' },
  ];

  const currentMonthStats = {
    openBio: {
      requests: 456789,
      tokens: 89234567,
      cost: 8942.34,
      avgLatency: 120,
      successRate: 99.87,
    },
    gemini: {
      requests: 298456,
      tokens: 52847931,
      cost: 5284.79,
      avgLatency: 340,
      successRate: 99.52,
    },
  };

  const totalCost = currentMonthStats.openBio.cost + currentMonthStats.gemini.cost;
  const totalRequests = currentMonthStats.openBio.requests + currentMonthStats.gemini.requests;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Total Requests</p>
              <p className="text-2xl font-bold text-ink">{(totalRequests / 1000).toFixed(0)}K</p>
              <p className="text-xs text-bio">This month</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Total Cost</p>
              <p className="text-2xl font-bold text-ink">${totalCost.toLocaleString()}</p>
              <p className="text-xs text-bio">+8.2% vs last month</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-neural flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Avg Latency</p>
              <p className="text-2xl font-bold text-ink">230ms</p>
              <p className="text-xs text-bio">Combined average</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-pulse flex items-center justify-center shadow-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Success Rate</p>
              <p className="text-2xl font-bold text-ink">99.7%</p>
              <p className="text-xs text-bio">Combined rate</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="usage" className="space-y-6">
        <TabsList className="neo-card bg-white p-2">
          <TabsTrigger value="usage">Usage Metrics</TabsTrigger>
          <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="features">Feature Usage</TabsTrigger>
        </TabsList>

        {/* Usage Metrics */}
        <TabsContent value="usage" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Daily AI Engine Requests (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
                <XAxis dataKey="date" stroke="var(--steel)" />
                <YAxis stroke="var(--steel)" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--pure)', 
                    border: '2px solid var(--cloud)',
                    borderRadius: '8px',
                  }} 
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="openBio" 
                  stroke="var(--electric)" 
                  strokeWidth={3}
                  name="OpenBioLLM"
                  dot={{ fill: 'var(--electric)', r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="gemini" 
                  stroke="var(--bio)" 
                  strokeWidth={3}
                  name="Google Gemini"
                  dot={{ fill: 'var(--bio)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* OpenBioLLM Stats */}
            <div className="neo-card bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3>OpenBioLLM</h3>
                  <p className="text-sm text-steel">Primary AI Engine</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-steel">Requests</span>
                    <span className="text-sm font-bold text-ink">
                      {currentMonthStats.openBio.requests.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={61} className="h-2" />
                  <p className="text-xs text-steel mt-1">61% of total requests</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cloud">
                  <div>
                    <p className="text-xs text-steel">Tokens Used</p>
                    <p className="font-bold text-ink">
                      {(currentMonthStats.openBio.tokens / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Avg Latency</p>
                    <p className="font-bold text-ink">{currentMonthStats.openBio.avgLatency}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Success Rate</p>
                    <p className="font-bold text-bio">{currentMonthStats.openBio.successRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Cost</p>
                    <p className="font-bold text-ink">${currentMonthStats.openBio.cost.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Google Gemini Stats */}
            <div className="neo-card bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3>Google Gemini</h3>
                  <p className="text-sm text-steel">Secondary AI Engine</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-steel">Requests</span>
                    <span className="text-sm font-bold text-ink">
                      {currentMonthStats.gemini.requests.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={39} className="h-2" />
                  <p className="text-xs text-steel mt-1">39% of total requests</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cloud">
                  <div>
                    <p className="text-xs text-steel">Tokens Used</p>
                    <p className="font-bold text-ink">
                      {(currentMonthStats.gemini.tokens / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Avg Latency</p>
                    <p className="font-bold text-ink">{currentMonthStats.gemini.avgLatency}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Success Rate</p>
                    <p className="font-bold text-bio">{currentMonthStats.gemini.successRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Cost</p>
                    <p className="font-bold text-ink">${currentMonthStats.gemini.cost.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Cost Analysis */}
        <TabsContent value="cost" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Daily Cost Breakdown (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
                <XAxis dataKey="date" stroke="var(--steel)" />
                <YAxis stroke="var(--steel)" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--pure)', 
                    border: '2px solid var(--cloud)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                />
                <Legend />
                <Bar dataKey="openBio" fill="var(--electric)" name="OpenBioLLM" radius={[8, 8, 0, 0]} />
                <Bar dataKey="gemini" fill="var(--bio)" name="Google Gemini" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="neo-card bg-white p-6">
              <p className="tag text-steel mb-2">Current Month</p>
              <p className="text-3xl font-bold text-ink">${totalCost.toLocaleString()}</p>
              <p className="text-sm text-bio mt-1">+8.2% vs last month</p>
            </div>
            <div className="neo-card bg-white p-6">
              <p className="tag text-steel mb-2">Projected This Month</p>
              <p className="text-3xl font-bold text-ink">${(totalCost * 2.1).toLocaleString()}</p>
              <p className="text-sm text-steel mt-1">Based on current rate</p>
            </div>
            <div className="neo-card bg-white p-6">
              <p className="tag text-steel mb-2">Cost per Request</p>
              <p className="text-3xl font-bold text-ink">${(totalCost / totalRequests).toFixed(4)}</p>
              <p className="text-sm text-steel mt-1">Average across engines</p>
            </div>
          </div>

          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Budget Alerts</h3>
            <div className="space-y-3">
              <div className="neo-card bg-pearl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-ink">Within Budget</p>
                  <p className="text-sm text-steel mt-1">
                    Current spending is 68% of monthly budget ($20,000)
                  </p>
                  <Progress value={68} className="h-2 mt-2" />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Response Time Comparison</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-electric"></div>
                      <span className="text-sm text-ink">OpenBioLLM</span>
                    </div>
                    <span className="text-sm font-bold text-ink">{currentMonthStats.openBio.avgLatency}ms</span>
                  </div>
                  <Progress value={30} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-bio"></div>
                      <span className="text-sm text-ink">Google Gemini</span>
                    </div>
                    <span className="text-sm font-bold text-ink">{currentMonthStats.gemini.avgLatency}ms</span>
                  </div>
                  <Progress value={85} className="h-2" />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-cloud">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-bio" />
                  <p className="text-sm font-medium text-ink">OpenBioLLM is 2.8x faster</p>
                </div>
                <p className="text-xs text-steel">
                  Consider routing time-sensitive operations to OpenBioLLM
                </p>
              </div>
            </div>

            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Error Rates</h3>
              <div className="space-y-4">
                <div className="neo-card bg-pearl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-ink">OpenBioLLM</span>
                    <Badge className="bg-bio/20 text-bio">{currentMonthStats.openBio.successRate}%</Badge>
                  </div>
                  <p className="text-xs text-steel">
                    {(currentMonthStats.openBio.requests * (1 - currentMonthStats.openBio.successRate / 100)).toFixed(0)} failed requests
                  </p>
                </div>

                <div className="neo-card bg-pearl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-ink">Google Gemini</span>
                    <Badge className="bg-bio/20 text-bio">{currentMonthStats.gemini.successRate}%</Badge>
                  </div>
                  <p className="text-xs text-steel">
                    {(currentMonthStats.gemini.requests * (1 - currentMonthStats.gemini.successRate / 100)).toFixed(0)} failed requests
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-cloud">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-bio" />
                  <p className="text-sm font-medium text-ink">Both engines performing well</p>
                </div>
              </div>
            </div>
          </div>

          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Performance Recommendations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="neo-card bg-pearl p-4">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-electric mt-0.5" />
                  <div>
                    <p className="font-medium text-ink mb-1">Optimize Routing</p>
                    <p className="text-sm text-steel">
                      Route real-time queries to OpenBioLLM for faster responses
                    </p>
                  </div>
                </div>
              </div>

              <div className="neo-card bg-pearl p-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-bio mt-0.5" />
                  <div>
                    <p className="font-medium text-ink mb-1">Cache Frequent Queries</p>
                    <p className="text-sm text-steel">
                      Implement caching to reduce redundant AI requests by ~30%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Feature Usage */}
        <TabsContent value="features" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">AI Usage by Feature</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={featureUsage}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {featureUsage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Top Features</h3>
              <div className="space-y-3">
                {featureUsage.map((feature, idx) => (
                  <div key={idx} className="neo-card bg-pearl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-ink">{feature.name}</span>
                      <span className="text-sm font-bold text-ink">{feature.value}%</span>
                    </div>
                    <Progress value={feature.value} className="h-2" />
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
