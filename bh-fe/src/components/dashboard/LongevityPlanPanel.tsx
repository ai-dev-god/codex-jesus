import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Shield, Sparkles } from 'lucide-react';
import type { LongevityPlan, PlanIntervention, RiskScoreEntry } from '../../lib/api/types';

interface LongevityPlanPanelProps {
  plans: LongevityPlan[] | null;
  loading: boolean;
  requesting: boolean;
  error: string | null;
  onRetry: () => void;
  onRequestPlan: () => void;
}

export default function LongevityPlanPanel({
  plans,
  loading,
  requesting,
  error,
  onRetry,
  onRequestPlan
}: LongevityPlanPanelProps) {
  const latestReadyPlan = plans?.find((plan) => plan.status === 'READY') ?? plans?.[0] ?? null;
  const sections = latestReadyPlan?.sections ?? [];
  const interventions = sections.flatMap((section) =>
    section.interventions.map((entry) => ({
      ...entry,
      section: section.heading
    }))
  );

  const topInterventions = interventions.slice(0, 3);
  const safetyState = latestReadyPlan?.safetyState ?? null;
  const scorecard = safetyState?.scorecard ?? [];

  return (
    <div className="neo-card p-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="tag text-steel mb-2">LONGEVITY PLAN</div>
          <h3>{latestReadyPlan?.title ?? 'Personalized longevity protocol'}</h3>
          <p className="text-steel">
            {latestReadyPlan?.summary ??
              'Upload labs or sync your wearables to unlock personalized guidance. Plans blend lifestyle, nutrition, and advanced biohacking tactics.'}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="px-4 py-3 rounded-xl border border-cloud text-steel font-semibold hover:bg-cloud/40 transition"
            disabled={loading}
          >
            Refresh
          </button>
          <button
            onClick={onRequestPlan}
            className="px-4 py-3 rounded-xl gradient-electric text-void font-bold hover:scale-[1.02] transition flex items-center gap-2"
            disabled={requesting}
          >
            {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Plan
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-solar/40 bg-solar/5 px-4 py-3 text-sm text-solar">
          <span>{error}</span>
          <button className="underline" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {loading && !latestReadyPlan && (
        <div className="flex items-center gap-3 text-steel animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin" />
          Fetching your AI plan…
        </div>
      )}

      {latestReadyPlan && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {topInterventions.length === 0 && (
              <div className="rounded-xl border border-cloud p-4 text-steel">
                No interventions available yet. Upload a recent lab panel to enrich this plan.
              </div>
            )}

            {topInterventions.map((item) => (
              <InterventionCard key={item.id} intervention={item} />
            ))}
          </div>

          <div className="space-y-4">
            <SafetyBadge safetyState={safetyState} />
            <RiskScoreCard scorecard={scorecard} />
          </div>
        </div>
      )}
    </div>
  );
}

const evidenceColors: Record<PlanIntervention['evidence_strength'], string> = {
  strong: 'bg-bio/10 text-bio border-bio/30',
  moderate: 'bg-electric/10 text-electric border-electric/30',
  weak: 'bg-solar/10 text-solar border-solar/30'
};

function InterventionCard({ intervention }: { intervention: PlanIntervention & { section: string } }) {
  return (
    <div className="rounded-xl border border-cloud p-5 bg-pearl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold text-steel mb-1">{intervention.section}</div>
          <h4 className="text-lg text-ink">{intervention.recommendation}</h4>
        </div>
        <div
          className={`text-xs font-semibold px-3 py-1 rounded-lg border ${evidenceColors[intervention.evidence_strength]}`}
        >
          {intervention.evidence_strength.toUpperCase()}
        </div>
      </div>
      {intervention.rationale && <p className="text-sm text-steel mb-3">{intervention.rationale}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="tag bg-cloud px-2 py-1 rounded-lg">{intervention.type}</span>
        <span className="tag bg-cloud px-2 py-1 rounded-lg">
          {intervention.guideline_alignment === 'in_guidelines' ? 'Guideline-backed' : 'Functional medicine'}
        </span>
        {intervention.disclaimer && (
          <span className="text-solar font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {intervention.disclaimer}
          </span>
        )}
      </div>
    </div>
  );
}

function SafetyBadge({ safetyState }: { safetyState: LongevityPlan['safetyState'] }) {
  if (!safetyState) {
    return (
      <div className="rounded-xl border border-cloud p-5 bg-pearl flex items-center gap-3">
        <Shield className="w-5 h-5 text-steel" />
        <div>
          <div className="text-sm font-semibold text-ink">Safety review pending</div>
          <p className="text-xs text-steel">New plans undergo dual-LLM validation before delivery.</p>
        </div>
      </div>
    );
  }

  const statusColor = safetyState.blocked
    ? 'text-solar bg-solar/10'
    : safetyState.requiresHandoff
      ? 'text-electric bg-electric/10'
      : 'text-bio bg-bio/10';
  const StatusIcon = safetyState.blocked ? AlertTriangle : safetyState.requiresHandoff ? Shield : CheckCircle2;
  const statusLabel = safetyState.blocked
    ? 'Blocked – clinician review required'
    : safetyState.requiresHandoff
      ? 'Pending clinician sign-off'
      : 'Validated by Gemini Safety';

  return (
    <div className="rounded-xl border border-cloud p-5 bg-pearl space-y-3">
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
        <StatusIcon className="w-3 h-3" />
        {statusLabel}
      </div>
      {safetyState.riskFlags.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-steel">Risk flags</div>
          <ul className="text-sm text-solar space-y-1 list-disc pl-4">
            {safetyState.riskFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
      {safetyState.disclaimers.length > 0 && (
        <div className="text-xs text-steel bg-cloud/80 rounded-lg p-3">
          {safetyState.disclaimers.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function RiskScoreCard({ scorecard }: { scorecard: RiskScoreEntry[] }) {
  if (!scorecard || scorecard.length === 0) {
    return (
      <div className="rounded-xl border border-cloud p-5 bg-pearl">
        <div className="tag text-steel mb-2">RISK SCORECARD</div>
        <p className="text-sm text-steel">Run a plan to unlock personalized risk simulations.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cloud p-5 bg-pearl space-y-4">
      <div className="tag text-steel">RISK SCORECARD</div>
      {scorecard.map((entry) => (
        <div key={entry.name} className="rounded-lg border border-cloud/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">{entry.name}</span>
            <span className={`text-sm font-bold ${riskColor(entry.risk)}`}>{Math.round(entry.score)}</span>
          </div>
          {entry.driver && <p className="text-xs text-steel mt-1">{entry.driver}</p>}
          {entry.recommendation && <p className="text-xs text-electric mt-1">{entry.recommendation}</p>}
        </div>
      ))}
    </div>
  );
}

const riskColor = (risk: RiskScoreEntry['risk']) => {
  switch (risk) {
    case 'high':
      return 'text-solar';
    case 'elevated':
      return 'text-electric';
    case 'low':
      return 'text-bio';
    default:
      return 'text-steel';
  }
};

