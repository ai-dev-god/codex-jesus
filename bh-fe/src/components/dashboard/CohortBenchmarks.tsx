import type { CohortBenchmark } from '../../lib/api/types';

interface CohortBenchmarksProps {
  benchmarks: CohortBenchmark[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function CohortBenchmarks({ benchmarks, loading, error, onRetry }: CohortBenchmarksProps) {
  return (
    <div className="neo-card p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="tag text-steel mb-1">COHORT BENCHMARKS</div>
          <h3 className="text-xl font-semibold text-ink">How you stack up</h3>
        </div>
        {error && (
          <button type="button" onClick={onRetry} className="text-sm text-pulse hover:text-pulse/80">
            Retry
          </button>
        )}
      </div>

      {loading && (!benchmarks || benchmarks.length === 0) && (
        <div className="h-32 w-full animate-pulse rounded-xl bg-cloud" />
      )}

      {!loading && (!benchmarks || benchmarks.length === 0) && !error && (
        <p className="text-sm text-steel">Upload more labs to unlock cohort comparisons.</p>
      )}

      {benchmarks && benchmarks.length > 0 && (
        <div className="divide-y divide-cloud">
          {benchmarks.map((benchmark) => (
            <div key={benchmark.markerName} className="py-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-ink">{benchmark.displayName}</p>
                <p className="text-xs text-steel">
                  Cohort avg: {benchmark.cohortAverage ?? '—'} {benchmark.unit ?? ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-steel">You</p>
                <p className="text-lg font-bold text-ink">
                  {benchmark.userValue ?? '—'} {benchmark.unit ?? ''}
                </p>
                {benchmark.percentile !== null && (
                  <p className="text-xs text-steel">{benchmark.percentile}th percentile</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

