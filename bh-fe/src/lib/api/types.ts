export type Role = 'ADMIN' | 'MEMBER';
export type UserStatus = 'PENDING_ONBOARDING' | 'ACTIVE' | 'SUSPENDED';

export interface SerializedUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface AuthResponse {
  user: SerializedUser;
  tokens: AuthTokens;
}

export interface DashboardTile {
  id: string;
  heading: string;
  value: number | null;
  delta: number | null;
  direction: 'UP' | 'DOWN' | 'STABLE';
  description: string;
  testId: string;
}

export interface DashboardActionItem {
  id: string;
  title: string;
  description: string;
  ctaType: 'LOG_BIOMARKER' | 'REVIEW_INSIGHT' | 'JOIN_FEED_DISCUSSION';
  testId?: string;
}

export type BiomarkerSource = 'WHOOP' | 'MANUAL' | 'LAB_UPLOAD';

export interface BiomarkerDefinition {
  id: string;
  slug: string;
  name: string;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  source: BiomarkerSource;
  createdAt: string;
  updatedAt: string;
}

export interface BiomarkerLog {
  id: string;
  biomarkerId: string;
  biomarker: BiomarkerDefinition;
  value: number;
  unit: string | null;
  source: BiomarkerSource;
  capturedAt: string;
  accepted: boolean;
  flagged: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardBiomarkerTrend {
  biomarkerId: string;
  biomarker: {
    id: string;
    slug: string;
    name: string;
    unit: string;
    referenceLow: number | null;
    referenceHigh: number | null;
    source: string;
    createdAt: string;
    updatedAt: string;
  };
  direction: 'UP' | 'DOWN' | 'STABLE';
  delta: number | null;
  windowDays: number;
}

export interface InsightSummary {
  id: string;
  userId: string;
  title: string;
  summary: string;
  body: DualEngineInsightBody | null;
  status: string;
  modelUsed: string | null;
  generatedAt: string;
  promptMetadata: Record<string, unknown> | null;
}

export interface DualEngineInsightEngineTrace {
  id?: string;
  label?: string;
  model?: string;
  completionId?: string;
  title?: string;
  summary?: string;
}

export interface DualEngineInsightMetadata {
  confidenceScore: number;
  agreementRatio: number;
  disagreements: {
    insights: string[];
    recommendations: string[];
  };
  engines: DualEngineInsightEngineTrace[];
}

export interface DualEngineInsightBody extends Record<string, unknown> {
  insights?: string[];
  recommendations?: string[];
  metadata?: DualEngineInsightMetadata | null;
}

export interface DashboardSummary {
  readinessScore: number | null;
  strainScore: number | null;
  sleepScore: number | null;
  latestWhoopSyncAt: string | null;
  todaysInsight: InsightSummary | null;
  biomarkerTrends: DashboardBiomarkerTrend[];
  actionItems: DashboardActionItem[];
  tiles: DashboardTile[];
  emptyStates: {
    needsBiomarkerLogs: boolean;
    needsInsight: boolean;
    needsWhoopLink: boolean;
  };
  generatedAt: string;
  cacheState: 'HIT' | 'MISS';
}

export interface PlanIntervention {
  id: string;
  type: 'Lifestyle' | 'Nutrition' | 'Supplement' | 'Advanced' | string;
  recommendation: string;
  rationale?: string;
  evidence_strength: 'strong' | 'moderate' | 'weak';
  evidence_type: 'guideline' | 'RCT' | 'observational' | 'expert_opinion' | string;
  guideline_alignment: 'in_guidelines' | 'neutral' | 'not_in_major_guidelines';
  disclaimer?: string;
}

export interface PlanSection {
  id: string;
  heading: string;
  summary?: string;
  interventions: PlanIntervention[];
}

export interface EvidenceEntry {
  intervention: string;
  evidence_strength: PlanIntervention['evidence_strength'];
  evidence_type: PlanIntervention['evidence_type'];
  guideline_alignment: PlanIntervention['guideline_alignment'];
  notes?: string;
}

export interface RiskScoreEntry {
  name: string;
  score: number;
  risk: 'low' | 'moderate' | 'elevated' | 'high';
  driver?: string;
  recommendation?: string;
}

export interface SafetyState {
  blocked: boolean;
  requiresHandoff: boolean;
  riskFlags: string[];
  disclaimers: string[];
  scorecard?: RiskScoreEntry[];
}

export interface LongevityPlan {
  id: string;
  userId: string;
  status: 'DRAFT' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED';
  title: string;
  summary: string | null;
  focusAreas: string[];
  sections: PlanSection[] | null;
  evidence: EvidenceEntry[] | null;
  safetyState: SafetyState | null;
  validatedBy: string | null;
  validatedAt: string | null;
  requestedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

