import { Activity, Droplet, Moon, Flame, Clock } from 'lucide-react';
import type { DashboardActionItem, DashboardBiomarkerTrend, DashboardSummary, DualEngineInsightMetadata } from '../../lib/api/types';
import { parseDualEngineBody } from '../../lib/dashboardInsight';

interface BentoGridProps {
  summary: DashboardSummary | null;
  loading?: boolean;
  onViewActions: () => void;
  onActionSelect: (action: DashboardActionItem) => void;
  onViewInsight: () => void;
}

const fallbackActions: DashboardActionItem[] = [
  { id: 'a', title: 'NAD+ Precursor', description: '500mg • 7:00 AM', ctaType: 'LOG_BIOMARKER' },
  { id: 'b', title: 'Omega-3 Complex', description: '2000mg • 7:15 AM', ctaType: 'LOG_BIOMARKER' },
  { id: 'c', title: 'Zone 2 Cardio', description: '20 min • 7:30 AM', ctaType: 'REVIEW_INSIGHT' }
];

const fallbackBiomarkers: DashboardBiomarkerTrend[] = [
  {
    biomarkerId: 'glucose',
    biomarker: {
      id: 'glucose',
      slug: 'glucose',
      name: 'Glucose',
      unit: 'mg/dL',
      referenceLow: 70,
      referenceHigh: 99,
      source: 'MANUAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    direction: 'STABLE',
    delta: 0,
    windowDays: 7
  }
];

export default function BentoGrid({ summary, loading, onViewActions, onActionSelect, onViewInsight }: BentoGridProps) {
  const actionItems = (summary?.actionItems ?? fallbackActions).slice(0, 3);
  const metricTiles = summary?.tiles ?? [];
  const biomarkerTrends = (summary?.biomarkerTrends ?? fallbackBiomarkers).slice(0, 4);
  const todaysInsight = summary?.todaysInsight;
  const dualEngineBody = parseDualEngineBody(todaysInsight?.body ?? null);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Action Items */}
      <div className={`col-span-12 lg:col-span-8 neo-card p-8 ${loading ? 'animate-pulse' : ''}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="tag text-steel mb-2">ACTION ITEMS</div>
            <h3>Your daily protocol</h3>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-bio/10">
            <div className="status-optimal" />
            <span className="text-sm font-bold text-bio">{actionItems.length} steps</span>
          </div>
        </div>

        <div className="space-y-3">
          {actionItems.map((item) => (
            <div key={item.id} className="flex items-start gap-4 p-4 rounded-xl bg-pearl border-2 border-cloud">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-cloud flex items-center justify-center">
                <Clock className="w-5 h-5 text-steel" />
              </div>

              <div className="flex-1">
                <div className="font-semibold text-ink mb-0.5">{item.title}</div>
                <div className="text-sm text-steel">{item.description}</div>
              </div>

              <button
                type="button"
                onClick={() => onActionSelect(item)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold border-2 border-electric/40 text-electric hover:bg-electric/10 transition"
              >
                {renderActionCtaLabel(item.ctaType)}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onViewActions}
          className="mt-6 w-full py-4 rounded-xl gradient-electric text-void font-bold hover:scale-[1.02] transition-transform"
        >
          View all actions
        </button>
      </div>

      {/* Metrics */}
      <div className="col-span-12 lg:col-span-4 space-y-6">
        <CompactMetric
          icon={Moon}
          label="Readiness"
          value={metricTiles.find((tile) => tile.id === 'readinessScore')?.value ?? null}
          unit=""
          trend={metricTiles.find((tile) => tile.id === 'readinessScore')?.delta ?? null}
          color="neural"
        />
        <CompactMetric
          icon={Flame}
          label="Strain"
          value={metricTiles.find((tile) => tile.id === 'strainScore')?.value ?? null}
          unit=""
          trend={metricTiles.find((tile) => tile.id === 'strainScore')?.delta ?? null}
          color="pulse"
        />
      </div>

      {/* Biomarker Grid */}
      <div className="col-span-12 lg:col-span-7 neo-card p-8">
        <div className="tag text-steel mb-4">KEY BIOMARKERS</div>
        <h3 className="mb-6">Health Indicators</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {biomarkerTrends.map((trend) => (
            <BiomarkerCard
              key={trend.biomarkerId}
              icon={Droplet}
              name={trend.biomarker.name}
              value={typeof trend.delta === 'number' ? trend.delta.toFixed(1) : '—'}
              unit={trend.biomarker.unit}
              status={resolveStatus(trend.direction)}
            />
          ))}
        </div>
      </div>

      {/* AI Insight */}
      <div className="col-span-12 lg:col-span-5 neo-card-electric p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl gradient-electric flex items-center justify-center flex-shrink-0">
            <Activity className="w-6 h-6 text-void" />
          </div>
          <div>
            <div className="tag text-electric-dim mb-2">AI INSIGHT</div>
            <h4 className="mb-3">{todaysInsight?.title ?? 'Cardiovascular Optimization'}</h4>
            <p className="text-steel leading-relaxed mb-4">
              {todaysInsight?.summary ??
                'Your HRV shows excellent recovery. Consider extending Zone 2 training to 25 minutes for enhanced mitochondrial adaptation.'}
            </p>
            {dualEngineBody.insights.length > 0 && (
              <InsightList label="Model highlights" items={dualEngineBody.insights} />
            )}
            {dualEngineBody.recommendations.length > 0 && (
              <InsightList label="Suggested actions" items={dualEngineBody.recommendations} tone="action" />
            )}
            {dualEngineBody.metadata && <DualEngineMetadataCard metadata={dualEngineBody.metadata} />}
            <button
              type="button"
              onClick={onViewInsight}
              className="text-sm font-bold text-electric hover:text-electric-bright transition-colors"
            >
              View Full Analysis →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CompactMetricProps {
  icon: React.ElementType;
  label: string;
  value: number | null;
  unit: string;
  trend: number | null;
  color: 'electric' | 'pulse' | 'bio' | 'neural';
}

function CompactMetric({ icon: Icon, label, value, unit, trend, color }: CompactMetricProps) {
  const gradientClass = `gradient-${color}`;
  const cardClass = `neo-card-${color}`;

  return (
    <div className={`${cardClass} p-6`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${gradientClass} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {typeof trend === 'number' && (
          <div className="px-3 py-1 rounded-full bg-bio/10">
            <span className="text-sm font-bold text-bio">
              {trend >= 0 ? '+' : ''}
              {trend.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      <div className="tag text-steel mb-2">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-ink">{typeof value === 'number' ? value.toFixed(1) : '—'}</span>
        <span className="text-sm text-steel">{unit}</span>
      </div>
    </div>
  );
}

interface BiomarkerCardProps {
  icon: React.ElementType;
  name: string;
  value: string;
  unit: string;
  status: 'optimal' | 'good' | 'warning';
}

function BiomarkerCard({ icon: Icon, name, value, unit, status }: BiomarkerCardProps) {
  const statusColors = {
    optimal: 'text-bio bg-bio/10',
    good: 'text-electric bg-electric/10',
    warning: 'text-solar bg-solar/10',
  };

  return (
    <div className="p-4 rounded-xl bg-pearl hover:bg-mist transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <Icon className="w-5 h-5 text-steel" />
        <span className="text-sm font-semibold text-ink">{name}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-ink">{value}</span>
        <span className="text-xs text-steel">{unit}</span>
      </div>
      <div className={`tag ${statusColors[status]} px-2 py-1 rounded-lg inline-block`}>
        {status.toUpperCase()}
      </div>
    </div>
  );
}

const resolveStatus = (direction: 'UP' | 'DOWN' | 'STABLE'): 'optimal' | 'good' | 'warning' => {
  if (direction === 'STABLE') {
    return 'good';
  }

  return direction === 'UP' ? 'optimal' : 'warning';
};

const renderActionCtaLabel = (ctaType: DashboardActionItem['ctaType']): string => {
  switch (ctaType) {
    case 'LOG_BIOMARKER':
      return 'Log biomarker';
    case 'REVIEW_INSIGHT':
      return 'Review insight';
    case 'JOIN_FEED_DISCUSSION':
      return 'Open community';
    default:
      return 'View action';
  }
};

function InsightList({
  label,
  items,
  tone = 'default'
}: {
  label: string;
  items: string[];
  tone?: 'default' | 'action';
}) {
  const accentClass = tone === 'action' ? 'border-electric/40 bg-electric/5' : 'border-cloud bg-pearl/60';
  return (
    <div className={`mb-4 rounded-xl border ${accentClass} p-4`}>
      <div className="text-xs font-semibold text-steel mb-2">{label}</div>
      <ul className="space-y-2 text-sm text-ink list-disc pl-4">
        {items.map((item, idx) => (
          <li key={`${label}-${idx}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DualEngineMetadataCard({ metadata }: { metadata: DualEngineInsightMetadata }) {
  const confidencePercent = Math.round(metadata.confidenceScore * 100);
  const hasDisagreements =
    metadata.disagreements.insights.length > 0 || metadata.disagreements.recommendations.length > 0;

  return (
    <div className="mb-4 rounded-xl border border-white/30 bg-white/30 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-steel">Dual-engine confidence</div>
        <div className="text-2xl font-bold text-electric">{confidencePercent}%</div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {metadata.engines.map((engine) => (
          <span
            key={`${engine.id}-${engine.model}`}
            className="text-xs font-semibold text-void bg-white/80 border border-cloud px-3 py-1 rounded-full"
          >
            {engine.label ?? engine.id ?? 'Engine'}
          </span>
        ))}
      </div>
      {hasDisagreements && (
        <div className="rounded-lg bg-white/60 p-3 border border-cloud/60 mb-3">
          <div className="text-xs font-semibold text-steel mb-2">Points of divergence</div>
          {[...metadata.disagreements.insights, ...metadata.disagreements.recommendations].map((entry, index) => (
            <p key={`disagreement-${index}`} className="text-xs text-solar">
              {entry}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
