import { Activity, Heart, Brain, Droplet, Moon, Zap } from 'lucide-react';

export default function MagazineGrid() {
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Large Feature Card - Spans 8 columns */}
      <div className="col-span-12 lg:col-span-8 float-card p-8 relative overflow-hidden group cursor-pointer">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-life/10 to-transparent rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <span className="text-micro text-text-tertiary">TODAY'S PROTOCOL</span>
          <h2 className="mt-4 mb-6">Morning Optimization Stack</h2>
          
          <div className="space-y-4 mb-8">
            {[
              { name: 'NAD+ Precursor', dose: '500mg', status: 'completed' },
              { name: 'Omega-3 DHA/EPA', dose: '2g', status: 'completed' },
              { name: 'Zone 2 Cardio', dose: '20 min', status: 'pending' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-ghost group-hover:bg-white transition-all">
                <div className={`w-3 h-3 rounded-full ${item.status === 'completed' ? 'bg-life' : 'bg-smoke'}`} />
                <div className="flex-1">
                  <div className="font-semibold text-text-primary">{item.name}</div>
                  <div className="text-sm text-text-tertiary">{item.dose}</div>
                </div>
                {item.status === 'completed' && (
                  <div className="text-xs font-bold text-life">✓ DONE</div>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="text-sm text-text-secondary">
              Progress: <span className="font-bold text-life">2/3 Complete</span>
            </div>
            <button className="px-6 py-3 rounded-2xl gradient-life text-white font-semibold hover:scale-105 transition-all shadow-lg">
              Complete All
            </button>
          </div>
        </div>
      </div>

      {/* Stacked Small Cards - 4 columns */}
      <div className="col-span-12 lg:col-span-4 space-y-6">
        <MetricCard
          icon={Heart}
          label="HRV"
          value="68"
          unit="ms"
          change="+12%"
          color="energy"
        />
        <MetricCard
          icon={Moon}
          label="Sleep"
          value="7.8"
          unit="hrs"
          change="+0.3"
          color="calm"
        />
      </div>

      {/* Wide Biomarker Card */}
      <div className="col-span-12 lg:col-span-7 float-card p-8">
        <span className="text-micro text-text-tertiary">BIOMARKERS</span>
        <h3 className="mt-2 mb-6">Key Health Indicators</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <BiomarkerMini icon={Droplet} label="Glucose" value="92" unit="mg/dL" status="optimal" />
          <BiomarkerMini icon={Activity} label="VO2 Max" value="48" unit="ml/kg/min" status="good" />
          <BiomarkerMini icon={Brain} label="Cortisol" value="12" unit="μg/dL" status="optimal" />
          <BiomarkerMini icon={Zap} label="Testosterone" value="650" unit="ng/dL" status="optimal" />
        </div>
      </div>

      {/* Quick Insight Card */}
      <div className="col-span-12 lg:col-span-5 float-card p-8 bg-gradient-to-br from-focus/5 to-calm/5 border-2 border-focus/10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl gradient-focus flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h4 className="mb-2">AI Insight</h4>
            <p className="text-sm text-text-secondary leading-relaxed">
              Your cardiovascular markers show excellent improvement. Consider increasing Zone 2 training to 25 minutes for optimal mitochondrial adaptation.
            </p>
            <button className="mt-4 text-sm font-semibold text-focus hover:underline">
              View Full Analysis →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  unit: string;
  change: string;
  color: 'life' | 'energy' | 'focus' | 'calm';
}

function MetricCard({ icon: Icon, label, value, unit, change, color }: MetricCardProps) {
  const gradientClass = `gradient-${color}`;
  
  return (
    <div className="float-card p-6 hover:scale-105 transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl ${gradientClass} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="px-3 py-1 rounded-full bg-life/10 text-xs font-bold text-life">
          {change}
        </div>
      </div>
      
      <div className="text-sm text-text-tertiary mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-text-primary">{value}</span>
        <span className="text-sm text-text-tertiary">{unit}</span>
      </div>
    </div>
  );
}

interface BiomarkerMiniProps {
  icon: React.ElementType;
  label: string;
  value: string;
  unit: string;
  status: 'optimal' | 'good' | 'warning';
}

function BiomarkerMini({ icon: Icon, label, value, unit, status }: BiomarkerMiniProps) {
  const statusColor = {
    optimal: 'text-life bg-life/10',
    good: 'text-focus bg-focus/10',
    warning: 'text-warning bg-warning/10',
  };
  
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-text-tertiary" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-tertiary">{label}</div>
        <div className="font-bold text-text-primary">
          {value} <span className="text-sm font-normal text-text-tertiary">{unit}</span>
        </div>
      </div>
      <div className={`px-2 py-1 rounded-lg text-xs font-bold ${statusColor[status]}`}>
        {status.toUpperCase()}
      </div>
    </div>
  );
}
