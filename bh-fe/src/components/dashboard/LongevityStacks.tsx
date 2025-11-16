import type { LongevityStack } from '../../lib/api/types';

interface LongevityStacksProps {
  stacks: LongevityStack[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const focusColors: Record<string, string> = {
  metabolic: 'electric',
  cardiovascular: 'bio',
  inflammation: 'pulse',
  hormonal: 'neural'
};

export default function LongevityStacks({ stacks, loading, error, onRetry }: LongevityStacksProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="tag text-steel mb-2">LONGEVITY STACKS</div>
          <h2>Precision protocols tuned to your latest labs</h2>
        </div>
        {error && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-semibold text-pulse hover:text-pulse/80 transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      {loading && (!stacks || stacks.length === 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="neo-card h-44 animate-pulse bg-cloud" />
          ))}
        </div>
      )}

      {!loading && (!stacks || stacks.length === 0) && !error && (
        <div className="neo-card border border-dashed border-cloud text-steel text-sm p-6">
          Upload a recent lab panel to unlock personalized supplement stacks and adherence insights.
        </div>
      )}

      {stacks && stacks.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {stacks.map((stack) => {
            const accent = focusColors[stack.focusArea] ?? 'electric';
            const accentBorderClass =
              accent === 'bio'
                ? 'border-bio'
                : accent === 'pulse'
                ? 'border-pulse'
                : accent === 'neural'
                ? 'border-neural'
                : 'border-electric';
            return (
              <div key={stack.id} className={`neo-card p-6 flex flex-col gap-4 border-t-4 ${accentBorderClass}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="tag text-xs uppercase tracking-wide text-steel mb-1">{stack.focusArea}</p>
                    <h3 className="text-xl font-semibold text-ink">{stack.title}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-steel">Adherence</p>
                    <p className="text-2xl font-semibold text-ink">{stack.adherenceScore}%</p>
                  </div>
                </div>

                <p className="text-sm text-steel">{stack.narrative}</p>

                <div className="flex flex-wrap gap-3">
                  {stack.keyBiomarkers.slice(0, 3).map((biomarker) => (
                    <div key={biomarker.markerName} className="rounded-xl border border-cloud px-3 py-2">
                      <p className="text-xs text-steel uppercase">{biomarker.markerName}</p>
                      <p
                        className={`text-sm font-semibold ${
                          biomarker.deltaPercentage !== null && biomarker.deltaPercentage < 0 ? 'text-bio' : 'text-pulse'
                        }`}
                      >
                        {biomarker.deltaPercentage !== null ? `${biomarker.deltaPercentage}%` : '∅'}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs uppercase text-steel mb-2">Recommended stack</p>
                  <div className="flex flex-wrap gap-2">
                    {stack.recommendedSupplements.map((supplement) => (
                      <span key={supplement} className="px-3 py-1 rounded-full bg-cloud text-xs font-semibold text-ink">
                        {supplement}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="text-sm text-pulse mt-3">
          {error}
        </p>
      )}
    </section>
  );
}

