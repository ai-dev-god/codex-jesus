import { Card } from '../ui/card';
import { Activity, Zap, Moon, Heart } from 'lucide-react';

const stats = [
  {
    label: 'HRV',
    value: '68',
    unit: 'ms',
    change: '+12%',
    icon: Heart,
    color: 'coral',
    positive: true,
  },
  {
    label: 'Recovery',
    value: '92',
    unit: '%',
    change: '+5%',
    icon: Zap,
    color: 'mint',
    positive: true,
  },
  {
    label: 'Sleep',
    value: '7.8',
    unit: 'hrs',
    change: '+0.3',
    icon: Moon,
    color: 'sky',
    positive: true,
  },
  {
    label: 'Strain',
    value: '14.2',
    unit: '',
    change: 'Moderate',
    icon: Activity,
    color: 'sage',
    positive: true,
  },
];

export default function QuickStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        
        const gradientClass = 
          stat.color === 'coral' ? 'coral-gradient' :
          stat.color === 'mint' ? 'mint-gradient' :
          stat.color === 'sky' ? 'sky-gradient' :
          'sage-gradient';
        
        return (
          <Card key={stat.label} className="p-6 hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer relative overflow-hidden group">
            {/* Hover effect background */}
            <div className="absolute inset-0 bg-gradient-to-br from-sage/5 to-sky/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl ${gradientClass} flex items-center justify-center shadow-md`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                {stat.positive && (
                  <div className="px-3 py-1 rounded-xl bg-mint/10 border-2 border-mint/25">
                    <span className="text-xs font-semibold text-mint-dark">{stat.change}</span>
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-sm text-stone mb-1">{stat.label}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-forest" style={{ letterSpacing: '-0.02em' }}>
                    {stat.value}
                  </span>
                  {stat.unit && (
                    <span className="text-sm text-stone">{stat.unit}</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
