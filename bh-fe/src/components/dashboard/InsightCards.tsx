import { Card } from '../ui/card';
import { AlertTriangle, TrendingUp, Lightbulb, Target } from 'lucide-react';
import { Badge } from '../ui/badge';

const insights = [
  {
    id: '1',
    type: 'alert',
    icon: AlertTriangle,
    title: 'Elevated Cortisol Detected',
    description: 'Your morning cortisol levels are 15% above optimal range. Consider stress management techniques.',
    action: 'View Protocol',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  {
    id: '2',
    type: 'improvement',
    icon: TrendingUp,
    title: 'HRV Showing Improvement',
    description: 'Your 7-day HRV average increased by 8.5%. Your recovery protocol is working effectively.',
    action: 'View Trends',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  {
    id: '3',
    type: 'recommendation',
    icon: Lightbulb,
    title: 'New Protocol Recommendation',
    description: 'Based on your latest labs, adding NAD+ precursors could improve mitochondrial function by 12-18%.',
    action: 'Learn More',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  {
    id: '4',
    type: 'goal',
    icon: Target,
    title: 'Approaching VO2 Max Goal',
    description: 'You\'re 2 points away from your target VO2 max. Maintain current cardio protocol for 3 more weeks.',
    action: 'View Goals',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
];

export default function InsightCards() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-neutral-900">Dual-Engine AI Insights</h2>
        <Badge variant="outline">4 New</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((insight) => {
          const Icon = insight.icon;
          return (
            <Card key={insight.id} className={`p-4 border ${insight.borderColor}`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${insight.bgColor}`}>
                  <Icon className={`w-5 h-5 ${insight.color}`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm text-neutral-900 mb-1">{insight.title}</h3>
                  <p className="text-sm text-neutral-600 mb-3">{insight.description}</p>
                  <button className={`text-sm hover:underline ${insight.color}`}>
                    {insight.action} →
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
