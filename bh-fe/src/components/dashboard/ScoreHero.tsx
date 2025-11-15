import { TrendingUp, Zap, Heart, Brain } from 'lucide-react';

export default function ScoreHero() {
  return (
    <div className="relative">
      {/* Main Score Card */}
      <div className="neo-card p-12 text-center relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full gradient-electric blur-3xl" />
        </div>

        <div className="relative z-10">
          {/* Label */}
          <div className="tag text-steel mb-8">LONGEVITY PERFORMANCE INDEX</div>

          {/* Score */}
          <div className="mb-6">
            <div className="metric-display bg-gradient-to-r from-electric via-neural to-pulse bg-clip-text text-transparent inline-block">
              86
            </div>
            
            {/* Change Indicator */}
            <div className="inline-flex items-center gap-2 ml-6 px-4 py-2 rounded-full neo-card-bio">
              <TrendingUp className="w-5 h-5 text-bio" />
              <span className="font-bold text-bio text-xl">+4</span>
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-xl text-steel mb-12">
            Top <span className="font-bold text-ink">12%</span> globally
          </p>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-6 max-w-3xl mx-auto">
            <MetricPill
              icon={Zap}
              label="Energy"
              value={92}
              color="electric"
            />
            <MetricPill
              icon={Heart}
              label="Recovery"
              value={88}
              color="pulse"
            />
            <MetricPill
              icon={Brain}
              label="Focus"
              value={84}
              color="neural"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricPillProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'electric' | 'pulse' | 'bio' | 'neural';
}

function MetricPill({ icon: Icon, label, value, color }: MetricPillProps) {
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
      <div className="text-3xl font-bold text-ink mb-1">{value}</div>
      <div className="tag text-steel">{label}</div>
    </div>
  );
}
