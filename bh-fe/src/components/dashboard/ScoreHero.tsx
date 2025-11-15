import { TrendingUp, Zap, Heart, Brain } from 'lucide-react';
import type { DashboardSummary, DashboardTile } from '../../lib/api/types';

interface ScoreHeroProps {
  summary: DashboardSummary | null;
  loading?: boolean;
}

export default function ScoreHero({ summary, loading }: ScoreHeroProps) {
  const tiles = summary?.tiles ?? [];
  const tileLookup = new Map<string, DashboardTile>();
  tiles.forEach((tile) => tileLookup.set(tile.id, tile));

  const readinessTile = tileLookup.get('readinessScore') ?? tiles[0];
  const heroValue = readinessTile?.value ?? null;
  const heroDelta = readinessTile?.delta ?? null;

  const quickMetrics = [
    { icon: Zap, label: 'Readiness', tile: tileLookup.get('readinessScore'), color: 'electric' as const },
    { icon: Heart, label: 'Strain', tile: tileLookup.get('strainScore'), color: 'pulse' as const },
    { icon: Brain, label: 'Sleep', tile: tileLookup.get('sleepScore'), color: 'neural' as const }
  ];

  return (
    <div className="relative">
      <div className={`neo-card p-12 text-center relative overflow-hidden ${loading ? 'animate-pulse' : ''}`}>
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full gradient-electric blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="tag text-steel mb-8">LONGEVITY PERFORMANCE INDEX</div>

          <div className="mb-6 flex flex-col items-center gap-4">
            <div className="metric-display bg-gradient-to-r from-electric via-neural to-pulse bg-clip-text text-transparent inline-block">
              {formatScore(heroValue)}
            </div>

            {typeof heroDelta === 'number' && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full neo-card-bio">
                <TrendingUp className="w-5 h-5 text-bio" />
                <span className="font-bold text-bio text-xl">
                  {heroDelta >= 0 ? '+' : ''}
                  {heroDelta.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          <p className="text-xl text-steel mb-12">
            {summary ? "Today's readiness based on your latest biomarker trends" : 'Sign in to unlock personalized metrics.'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {quickMetrics.map((metric) => (
              <MetricPill
                key={metric.label}
                icon={metric.icon}
                label={metric.label}
                value={metric.tile?.value ?? null}
                trend={metric.tile?.delta ?? null}
                color={metric.color}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricPillProps {
  icon: React.ElementType;
  label: string;
  value: number | null;
  trend: number | null;
  color: 'electric' | 'pulse' | 'bio' | 'neural';
}

function MetricPill({ icon: Icon, label, value, trend, color }: MetricPillProps) {
  const colorClasses = {
    electric: 'neo-card-electric',
    pulse: 'neo-card-pulse',
    bio: 'neo-card-bio',
    neural: 'neo-card-neural',
  };

  const iconColorClasses = {
    electric: 'text-electric',
    pulse: 'text-pulse',
    bio: 'text-bio',
    neural: 'text-neural',
  };

  return (
    <div className={`${colorClasses[color]} p-6 rounded-2xl`}>
      <Icon className={`w-8 h-8 ${iconColorClasses[color]} mx-auto mb-3`} />
      <div className="text-3xl font-bold text-ink mb-1">{formatScore(value)}</div>
      <div className="flex items-center justify-center gap-2 text-sm text-steel">
        <span className="tag text-steel">{label}</span>
        {typeof trend === 'number' && (
          <span className={trend >= 0 ? 'text-bio' : 'text-pulse'}>
            {trend >= 0 ? '+' : ''}
            {trend.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

const formatScore = (value: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return Math.round(value).toString();
};
