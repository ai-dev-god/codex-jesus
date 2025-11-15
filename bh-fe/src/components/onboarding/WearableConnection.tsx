import { Badge } from '../ui/badge';
import { Check, Activity } from 'lucide-react';
import { useState } from 'react';

const wearables = [
  {
    id: 'whoop',
    name: 'WHOOP',
    description: 'HRV, recovery, strain, sleep tracking',
    color: 'pulse',
    popular: true,
  },
  {
    id: 'apple',
    name: 'Apple Health',
    description: 'Activity, heart rate, workouts',
    color: 'bio',
    popular: true,
  },
  {
    id: 'google',
    name: 'Google Fit',
    description: 'Steps, activity, heart rate',
    color: 'electric',
    popular: false,
  },
  {
    id: 'oura',
    name: 'Oura Ring',
    description: 'Sleep, readiness, activity',
    color: 'neural',
    popular: true,
  },
  {
    id: 'garmin',
    name: 'Garmin',
    description: 'Fitness, training, performance',
    color: 'solar',
    popular: false,
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    description: 'Activity, sleep, heart rate',
    color: 'electric',
    popular: false,
  },
];

export default function WearableConnection() {
  const [connected, setConnected] = useState<string[]>([]);

  const toggleConnection = (id: string) => {
    if (connected.includes(id)) {
      setConnected(connected.filter(item => item !== id));
    } else {
      setConnected([...connected, id]);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-2">Connect Your Wearables</h3>
        <p className="text-steel">
          Connect your wearable devices to automatically sync your health data. 
          We support 150+ biomarkers from leading health trackers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wearables.map((wearable) => {
          const isConnected = connected.includes(wearable.id);
          const cardClass = isConnected ? `neo-card-${wearable.color}` : 'neo-card';
          const gradientClass = `gradient-${wearable.color}`;
          
          return (
            <button
              key={wearable.id}
              className={`${cardClass} p-6 cursor-pointer transition-all hover:scale-105 text-left`}
              onClick={() => toggleConnection(wearable.id)}
            >
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl ${gradientClass} flex items-center justify-center flex-shrink-0`}>
                  <Activity className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h4 className="mb-1">{wearable.name}</h4>
                      {wearable.popular && (
                        <Badge variant="success" className="text-xs">POPULAR</Badge>
                      )}
                    </div>
                    {isConnected && (
                      <div className="w-8 h-8 rounded-lg gradient-bio flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-steel">{wearable.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {connected.length > 0 && (
        <div className="p-6 rounded-xl bg-bio/5 border-2 border-bio/20">
          <div className="flex items-start gap-3">
            <div className="status-optimal mt-1" />
            <div>
              <p className="font-semibold text-ink mb-1">
                {connected.length} device{connected.length > 1 ? 's' : ''} connected
              </p>
              <p className="text-sm text-steel">
                Your data will sync automatically in the background. You can manage connections anytime in Settings.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
