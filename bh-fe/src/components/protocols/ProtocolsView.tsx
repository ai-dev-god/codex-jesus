import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { BookOpen, Clock, Award, TrendingUp, ChevronRight, Sparkles, Loader2, History } from 'lucide-react';
import { fetchLongevityPlans } from '../../lib/api/ai';
import type { LongevityPlan } from '../../lib/api/types';
import { useAuth } from '../../lib/auth/AuthContext';

// Helper to map color based on index/string
const getProtocolColor = (index: number) => {
  const colors = ['electric', 'bio', 'neural', 'solar', 'pulse'];
  return colors[index % colors.length];
};

export default function ProtocolsView() {
  const { ensureAccessToken } = useAuth();
  const [activePlan, setActivePlan] = useState<LongevityPlan | null>(null);
  const [recommendedPlans, setRecommendedPlans] = useState<LongevityPlan[]>([]);
  const [historicalPlans, setHistoricalPlans] = useState<LongevityPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlan() {
      try {
        const token = await ensureAccessToken();
        const plans = await fetchLongevityPlans(token, 5);
        if (plans.length > 0) {
          const readyPlan = plans.find((plan) => plan.status === 'READY') ?? plans[0];
          setActivePlan(readyPlan);
          const remainingPlans = plans.filter((plan) => plan.id !== readyPlan.id);
          setRecommendedPlans(
            remainingPlans.filter((plan) =>
              ['READY', 'PROCESSING', 'DRAFT'].includes(plan.status)
            )
          );
          setHistoricalPlans(
            remainingPlans.filter((plan) => ['FAILED', 'ARCHIVED'].includes(plan.status))
          );
        }
      } catch (err) {
        console.error('Failed to load longevity plan', err);
        setError('Failed to load protocols');
      } finally {
        setIsLoading(false);
      }
    }
    loadPlan();
  }, [ensureAccessToken]);

  // Map active plan sections to protocols format
  const activeProtocols = useMemo(() => {
    if (!activePlan?.sections) {
      return [];
    }
    return activePlan.sections.map((section, index) => {
      const interventions = section.interventions || [];
      const highEvidenceCount = interventions.filter((i) => i.evidence_strength === 'strong').length;
      const evidenceLevel = highEvidenceCount > 0 ? 'High' : 'Medium';

      return {
        id: section.id,
        title: section.heading,
        category: activePlan.focusAreas?.[0] || 'General Longevity',
        duration: 'Ongoing',
        evidence: evidenceLevel,
        adherence: Math.min(100, interventions.length * 10),
        impact: section.summary || 'Optimized for your biomarkers',
        components: interventions.map((i) => i.recommendation),
        citations: interventions.length,
        color: getProtocolColor(index),
      };
    });
  }, [activePlan]);

  if (isLoading) {
    return (
      <div className="min-h-screen mesh-gradient flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-electric animate-spin" />
      </div>
    );
  }

  const errorBanner = error ? (
    <div className="rounded-xl border border-pulse/30 bg-pulse/10 px-4 py-3 text-sm text-pulse">
      {error}
    </div>
  ) : null;

  return (
    <div className="min-h-screen mesh-gradient py-12 px-6" data-testid="view-protocols">
      <div className="max-w-7xl mx-auto space-y-12">
        {errorBanner}
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="tag text-steel mb-3">PROTOCOLS</div>
            <h2 className="mb-4">Evidence-based interventions</h2>
            <p className="text-xl text-steel max-w-2xl">
              Personalized protocols powered by your biomarkers and AI analysis
            </p>
          </div>
          <Button size="lg">
            <BookOpen className="w-5 h-5 mr-2" />
            Research Library
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList>
            <TabsTrigger value="active">Active Protocols</TabsTrigger>
            <TabsTrigger value="recommended">Recommended</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Active Protocols */}
          <TabsContent value="active" className="mt-8 space-y-6">
            {activeProtocols.length === 0 ? (
              <div className="neo-card p-16 text-center">
                <div className="w-20 h-20 rounded-2xl bg-pearl mx-auto mb-6 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-steel" />
                </div>
                <h3 className="mb-3">No active protocols</h3>
                <p className="text-steel max-w-md mx-auto mb-6">
                  Generate your first longevity plan to get personalized protocols based on your biomarkers.
                </p>
                {/* Placeholder for generation trigger if needed, or user goes to onboarding */}
              </div>
            ) : (
              activeProtocols.map((protocol) => {
                const cardClass = `neo-card-${protocol.color}`;
                const gradientClass = `gradient-${protocol.color}`;
                const evidenceBadge = protocol.evidence === 'High' ? 'success' : 'warning';

                return (
                  <div key={protocol.id} className={`${cardClass} p-8 hover:scale-[1.02] transition-transform`}>
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-6">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <h3>{protocol.title}</h3>
                          <span className="tag text-steel">{protocol.category}</span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-6 mb-4">
                          <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-steel" />
                            <span className="text-sm font-semibold text-ink">{protocol.duration}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Award className="w-5 h-5 text-steel" />
                            <Badge variant={evidenceBadge as any}>
                              {protocol.evidence} Evidence
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-steel" />
                            <span className="text-sm font-semibold text-ink">{protocol.citations} Interventions</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-bio" />
                            <span className="text-sm font-semibold text-bio">{protocol.impact}</span>
                          </div>
                        </div>
                      </div>
                      
                      <Button variant="outline">
                        View Details
                        <ChevronRight className="w-5 h-5 ml-2" />
                      </Button>
                    </div>

                    {/* Adherence Bar */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-steel">Protocol Adherence</span>
                        <span className="text-sm font-bold text-ink">{protocol.adherence}%</span>
                      </div>
                      <div className="w-full bg-pearl rounded-full h-3 overflow-hidden">
                        <div
                          className={`${gradientClass} h-3 rounded-full transition-all duration-500`}
                          style={{ width: `${protocol.adherence}%` }}
                        />
                      </div>
                    </div>

                    {/* Components */}
                    <div className="flex flex-wrap gap-2">
                      {protocol.components.map((component, i) => (
                        <span
                          key={i}
                          className="px-4 py-2 bg-white rounded-xl text-sm font-semibold text-ink border-2 border-cloud"
                        >
                          {component}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* Recommended Protocols */}
          <TabsContent value="recommended" className="mt-8 space-y-6">
            {isLoading ? (
              <div className="neo-card p-12 text-center text-steel">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                Preparing protocol recommendations…
              </div>
            ) : recommendedPlans.length === 0 ? (
              <div className="neo-card p-12 text-center text-steel">
                <Sparkles className="w-10 h-10 mx-auto mb-4 text-electric" />
                <p>No additional protocols are queued yet. Generate a new plan to expand your protocol library.</p>
              </div>
            ) : (
              recommendedPlans.map((plan, index) => (
                <div key={plan.id} className={`neo-card-${getProtocolColor(index + 1)} p-8`}>
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <h3>{plan.title}</h3>
                        <Badge variant="default" className="bg-electric text-void">
                          <Sparkles className="w-3 h-3 mr-1" />
                          {plan.status === 'PROCESSING' ? 'Processing' : 'Queued'}
                        </Badge>
                      </div>

                      <p className="text-ink mb-4">
                        {plan.summary ?? 'Personalized recommendations based on recent biomarker trends.'}
                      </p>

                      {plan.focusAreas.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {plan.focusAreas.map((focus) => (
                            <span key={focus} className="px-3 py-1 bg-cloud rounded-full text-sm text-steel">
                              {focus}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <Button size="lg" variant="outline">
                        View Plan
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="mt-8 space-y-6">
            {isLoading ? (
              <div className="neo-card p-12 text-center text-steel">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                Loading history…
              </div>
            ) : historicalPlans.length === 0 ? (
              <div className="neo-card p-16 text-center">
                <div className="w-20 h-20 rounded-2xl bg-pearl mx-auto mb-6 flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-steel" />
                </div>
                <h3 className="mb-3">No completed protocols yet</h3>
                <p className="text-steel max-w-md mx-auto">
                  Complete your first protocol to see your history and track your longevity progress over time.
                </p>
              </div>
            ) : (
              historicalPlans.map((plan) => (
                <div key={plan.id} className="neo-card p-8">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3>{plan.title}</h3>
                      <Badge variant="outline" className="flex items-center gap-2">
                        <History className="w-4 h-4" />
                        {plan.status}
                      </Badge>
                    </div>
                    <p className="text-steel">{plan.summary ?? 'Legacy protocol awaiting review.'}</p>
                    <p className="text-xs text-neutral-500">
                      Updated {new Date(plan.updatedAt).toLocaleDateString()} • Requested{' '}
                      {new Date(plan.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
