import { Card } from '../ui/card';
import { TrendingUp, Leaf, Heart, Brain, Activity } from 'lucide-react';

export default function LongevityScore() {
  const score = 86;
  const change = +4;
  const circumference = 2 * Math.PI * 90;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card className="p-8 relative overflow-hidden">
      {/* Nature Pattern Background */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-gradient-to-br from-sage/10 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-gradient-to-tr from-sky/10 to-transparent blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-2xl wellness-gradient flex items-center justify-center shadow-md">
                <Leaf className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-forest">Longevity Score</h2>
            </div>
            <p className="text-stone">Your comprehensive wellness index</p>
          </div>
          {change > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-mint/10 border-2 border-mint/30">
              <TrendingUp className="w-4 h-4 text-mint-dark" />
              <span className="font-semibold text-mint-dark">+{change} pts</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-12">
          {/* Circular Score Visualization */}
          <div className="relative">
            <svg className="w-56 h-56 -rotate-90">
              {/* Background circle */}
              <circle
                cx="112"
                cy="112"
                r="90"
                fill="none"
                stroke="currentColor"
                strokeWidth="14"
                className="text-cloud"
              />
              {/* Progress circle with wellness gradient */}
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--sage)" />
                  <stop offset="50%" stopColor="var(--mint)" />
                  <stop offset="100%" stopColor="var(--sky)" />
                </linearGradient>
              </defs>
              <circle
                cx="112"
                cy="112"
                r="90"
                fill="none"
                stroke="url(#scoreGradient)"
                strokeWidth="14"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="drop-shadow-lg transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-bold text-forest" style={{ letterSpacing: '-0.02em' }}>
                {score}
              </span>
              <span className="text-stone mt-1">/ 100</span>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="flex-1 space-y-4">
            <ScoreMetric
              icon={Heart}
              label="Cardiovascular"
              score={92}
              color="coral"
            />
            <ScoreMetric
              icon={Brain}
              label="Cognitive"
              score={84}
              color="sky"
            />
            <ScoreMetric
              icon={Activity}
              label="Metabolic"
              score={88}
              color="sage"
            />
          </div>
        </div>

        {/* Insights */}
        <div className="mt-8 p-5 rounded-2xl bg-gradient-to-br from-cloud to-sand border-2 border-[rgba(123,165,145,0.1)]">
          <p className="text-sm text-forest mb-2">
            <span className="font-semibold">Excellent progress!</span> Your cardiovascular markers show significant improvement this month.
          </p>
          <p className="text-sm text-stone">
            Focus areas: Enhanced sleep quality and stress management could boost your score even further.
          </p>
        </div>
      </div>
    </Card>
  );
}

interface ScoreMetricProps {
  icon: React.ElementType;
  label: string;
  score: number;
  color: 'sage' | 'sky' | 'coral' | 'mint';
}

function ScoreMetric({ icon: Icon, label, score, color }: ScoreMetricProps) {
  const colorClasses = {
    sage: { bg: 'bg-sage/10', text: 'text-sage-dark', gradient: 'sage-gradient' },
    sky: { bg: 'bg-sky/10', text: 'text-sky-dark', gradient: 'sky-gradient' },
    coral: { bg: 'bg-coral/10', text: 'text-coral-dark', gradient: 'coral-gradient' },
    mint: { bg: 'bg-mint/10', text: 'text-mint-dark', gradient: 'mint-gradient' },
  };

  const colors = colorClasses[color];

  return (
    <div className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl ${colors.bg} flex items-center justify-center`}>
        <Icon className={`w-6 h-6 ${colors.text}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-forest">{label}</span>
          <span className={`text-sm font-semibold ${colors.text}`}>{score}%</span>
        </div>
        <div className="h-2.5 bg-cloud rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.gradient} rounded-full transition-all duration-500 shadow-sm`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}
