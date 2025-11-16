import type { EarlyWarning } from '../../lib/api/types';
import { AlertTriangle } from 'lucide-react';

interface EarlyWarningsProps {
  warnings: EarlyWarning[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function EarlyWarnings({ warnings, loading, error, onRetry }: EarlyWarningsProps) {
  return (
    <div className="neo-card p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="tag text-steel mb-1">EARLY WARNINGS</div>
          <h3 className="text-xl font-semibold text-ink">Proactive alerts</h3>
        </div>
        {error && (
          <button type="button" onClick={onRetry} className="text-sm text-pulse hover:text-pulse/80">
            Retry
          </button>
        )}
      </div>

      {loading && (!warnings || warnings.length === 0) && (
        <div className="h-32 w-full animate-pulse rounded-xl bg-cloud" />
      )}

      {!loading && (!warnings || warnings.length === 0) && !error && (
        <p className="text-sm text-steel">All biomarkers look stable. Keep your current cadence.</p>
      )}

      {warnings && warnings.length > 0 && (
        <div className="space-y-3">
          {warnings.map((warning) => (
            <div key={warning.markerName} className="rounded-xl border border-pulse/20 bg-pulse/5 px-4 py-3 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-pulse mt-0.5" />
              <div>
                <p className="font-semibold text-ink">
                  {warning.markerName}{' '}
                  {warning.value !== null && (
                    <span className="text-sm text-steel">
                      {warning.value} {warning.unit ?? ''}
                    </span>
                  )}
                </p>
                <p className="text-sm text-steel">{warning.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

