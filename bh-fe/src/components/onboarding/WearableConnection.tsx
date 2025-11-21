import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/badge';
import { Check, Activity, RefreshCw, Link2, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import { getWhoopStatus, requestWhoopLink, unlinkWhoop, type WhoopLinkStatus } from '../../lib/api/whoop';

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
  const { ensureAccessToken } = useAuth();
  const [connected, setConnected] = useState<string[]>([]);
  const [whoopStatus, setWhoopStatus] = useState<WhoopLinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const status = await getWhoopStatus(token);
      setWhoopStatus(status);
      setConnected((prev) => {
        const next = new Set(prev);
        if (status.linked) {
          next.add('whoop');
        } else {
          next.delete('whoop');
        }
        return Array.from(next);
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to load wearable integrations right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleWhoopLink = useCallback(async () => {
    setActionLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const status = await requestWhoopLink(token);
      setWhoopStatus(status);
      if (status.linkUrl) {
        window.location.href = status.linkUrl;
      } else {
        toast.info('Whoop integration is already linked or not configured.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to initiate Whoop linking. Please try again.');
      }
    } finally {
      setActionLoading(false);
    }
  }, [ensureAccessToken]);

  const handleWhoopUnlink = useCallback(async () => {
    setActionLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      await unlinkWhoop(token);
      toast.success('Whoop integration disconnected.');
      await fetchStatus();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to disconnect Whoop at this time.');
      }
    } finally {
      setActionLoading(false);
    }
  }, [ensureAccessToken, fetchStatus]);

  const handleWearableClick = (id: string) => {
    if (id === 'whoop') {
      if (actionLoading) {
        return;
      }
      void handleWhoopLink();
      return;
    }

    if (connected.includes(id)) {
      setConnected(connected.filter((item) => item !== id));
    } else {
      setConnected([...connected, id]);
    }
  };

  const whoopSubtitle = useMemo(() => {
    if (loading) {
      return 'Checking your Whoop status...';
    }
    if (whoopStatus?.linked) {
      return `Last sync ${whoopStatus.lastSyncAt ? new Date(whoopStatus.lastSyncAt).toLocaleString() : 'pending'}`;
    }
    if (whoopStatus && !whoopStatus.linkUrl) {
      return 'Whoop is not configured for this environment.';
    }
    return 'HRV, recovery, strain, sleep tracking';
  }, [whoopStatus, loading]);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-2">Connect Your Wearables</h3>
        <p className="text-steel">
          Connect your wearable devices to automatically sync your health data. 
          We support 150+ biomarkers from leading health trackers.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-pulse/40 bg-pulse/10 px-4 py-3 text-sm text-pulse mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wearables.map((wearable) => {
          const isConnected = connected.includes(wearable.id);
          const isWhoop = wearable.id === 'whoop';
          const cardClass = isConnected ? `neo-card-${wearable.color}` : 'neo-card';
          const gradientClass = `gradient-${wearable.color}`;
          
          return (
            <div
              key={wearable.id}
              className={`${cardClass} p-6 cursor-pointer transition-all hover:scale-105 text-left`}
              role="button"
              tabIndex={0}
              onClick={() => handleWearableClick(wearable.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleWearableClick(wearable.id);
                }
              }}
              aria-disabled={isWhoop && actionLoading}
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
                  <p className="text-sm text-steel">
                    {isWhoop ? whoopSubtitle : wearable.description}
                  </p>
                </div>
              </div>
              {isWhoop && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink border border-cloud hover:bg-pearl transition-colors disabled:opacity-60"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void fetchStatus();
                      }}
                    disabled={loading || actionLoading}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh Status
                  </button>
                  {isConnected ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl bg-pulse/10 px-4 py-2 text-sm font-semibold text-pulse border border-pulse/30 hover:bg-pulse/20 transition-colors disabled:opacity-60"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleWhoopUnlink();
                      }}
                      disabled={actionLoading}
                    >
                      <Unplug className="w-4 h-4" />
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl gradient-electric px-4 py-2 text-sm font-semibold text-void shadow-lg hover:scale-[1.01] transition-transform disabled:opacity-60"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleWhoopLink();
                      }}
                      disabled={actionLoading || loading || !whoopStatus?.linkUrl}
                    >
                      <Link2 className="w-4 h-4" />
                      Connect Whoop
                    </button>
                  )}
                </div>
              )}
            </div>
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
