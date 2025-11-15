import { Activity, Droplet, Moon, Flame, TrendingUp, CheckCircle2, Clock } from 'lucide-react';

export default function BentoGrid() {
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Large Protocol Card */}
      <div className="col-span-12 lg:col-span-8 neo-card p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="tag text-steel mb-2">TODAY'S PROTOCOL</div>
            <h3>Morning Performance Stack</h3>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-bio/10">
            <div className="status-optimal" />
            <span className="text-sm font-bold text-bio">2/3 Complete</span>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { name: 'NAD+ Precursor', dose: '500mg', time: '7:00 AM', completed: true },
            { name: 'Omega-3 Complex', dose: '2000mg', time: '7:15 AM', completed: true },
            { name: 'Zone 2 Cardio', dose: '20 min', time: '7:30 AM', completed: false },
          ].map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                item.completed
                  ? 'bg-bio/5 border-2 border-bio/20'
                  : 'bg-pearl border-2 border-cloud'
              }`}
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                item.completed ? 'gradient-bio' : 'bg-cloud'
              }`}>
                {item.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-white" />
                ) : (
                  <Clock className="w-5 h-5 text-steel" />
                )}
              </div>

              <div className="flex-1">
                <div className="font-semibold text-ink mb-0.5">{item.name}</div>
                <div className="text-sm text-steel">{item.dose} • {item.time}</div>
              </div>

              {item.completed && (
                <div className="tag text-bio">DONE</div>
              )}
            </div>
          ))}
        </div>

        <button className="mt-6 w-full py-4 rounded-xl gradient-electric text-void font-bold hover:scale-[1.02] transition-transform">
          Complete Remaining Task
        </button>
      </div>

      {/* Stacked Metric Cards */}
      <div className="col-span-12 lg:col-span-4 space-y-6">
        <CompactMetric
          icon={Moon}
          label="Sleep Quality"
          value="7.8"
          unit="hrs"
          trend="+0.3"
          color="neural"
        />
        <CompactMetric
          icon={Flame}
          label="HRV"
          value="68"
          unit="ms"
          trend="+12%"
          color="pulse"
        />
      </div>

      {/* Biomarker Grid */}
      <div className="col-span-12 lg:col-span-7 neo-card p-8">
        <div className="tag text-steel mb-4">KEY BIOMARKERS</div>
        <h3 className="mb-6">Health Indicators</h3>

        <div className="grid grid-cols-2 gap-4">
          <BiomarkerCard
            icon={Droplet}
            name="Glucose"
            value="92"
            unit="mg/dL"
            status="optimal"
          />
          <BiomarkerCard
            icon={Activity}
            name="VO2 Max"
            value="48"
            unit="ml/kg/min"
            status="optimal"
          />
          <BiomarkerCard
            icon={TrendingUp}
            name="Testosterone"
            value="650"
            unit="ng/dL"
            status="optimal"
          />
          <BiomarkerCard
            icon={Flame}
            name="Cortisol"
            value="12"
            unit="μg/dL"
            status="good"
          />
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
            <h4 className="mb-3">Cardiovascular Optimization</h4>
            <p className="text-steel leading-relaxed mb-4">
              Your HRV shows excellent recovery. Consider extending Zone 2 training to 25 minutes for enhanced mitochondrial adaptation.
            </p>
            <button className="text-sm font-bold text-electric hover:text-electric-bright transition-colors">
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
  value: string;
  unit: string;
  trend: string;
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
        <div className="px-3 py-1 rounded-full bg-bio/10">
          <span className="text-sm font-bold text-bio">{trend}</span>
        </div>
      </div>

      <div className="tag text-steel mb-2">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-ink">{value}</span>
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
