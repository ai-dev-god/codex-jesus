import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Users,
  Zap,
  Settings,
  Link2,
  Home,
  Dumbbell,
  Apple,
  Beaker,
  Shield,
  ListChecks,
  CalendarClock,
  RefreshCcw,
  Sparkles,
  Droplet,
  Bell,
  UserRound,
  ArrowRightFromLine
} from 'lucide-react';
import { toast } from 'sonner';

import VerticalNav from '../layout/VerticalNav';
import CommandBar, { type CommandActionDescriptor, type CommandGroupDescriptor } from '../layout/CommandBar';
import LandingPage from '../landing/LandingPage';
import AuthScreen from '../auth/AuthScreen';
import Dashboard from '../dashboard/Dashboard';
import OnboardingFlow from '../onboarding/OnboardingFlow';
import LabUploadPage from '../labs/LabUploadPage';
import ProtocolsView from '../protocols/ProtocolsView';
import PractitionerWorkspace from '../practitioner/PractitionerWorkspace';
import CommunityFeed from '../community/CommunityFeed';
import SettingsPage from '../settings/SettingsPage';
import IntegrationsPage from '../integrations/IntegrationsPage';
import GymWorkoutCreator from '../gym/GymWorkoutCreator';
import NutritionView from '../nutrition/NutritionView';
import AdminDashboard from '../admin/AdminDashboard';
import { useTranslation } from '../../lib/i18n/LanguageContext';
import type {
  AuthResponse,
  DashboardActionItem,
  DashboardSummary,
  LongevityPlan,
  LongevityStack,
  CohortBenchmark,
  EarlyWarning,
  SerializedUser,
  BiomarkerDefinition,
  AdminAccessSummary
} from '../../lib/api/types';
import { fetchDashboardSummary } from '../../lib/api/dashboard';
import { fetchCurrentUser, logoutUser, refreshTokens } from '../../lib/api/auth';
import { ApiError } from '../../lib/api/error';
import {
  fetchLongevityPlans,
  fetchLongevityStacks,
  fetchCohortBenchmarks,
  fetchEarlyWarnings,
  requestLongevityPlan,
  requestAiInterpretation as requestAiInterpretationApi
} from '../../lib/api/ai';
import { listBiomarkerDefinitions, createManualBiomarkerLog } from '../../lib/api/biomarkers';
import { fetchProfile, updateProfile, type ConsentRecord, type Profile } from '../../lib/api/profile';
import { fetchAdminAccess } from '../../lib/api/admin';
import {
  clearPersistedSession,
  createSessionFromAuthResponse,
  loadSession,
  normalizeTokens,
  persistSession,
  type StoredSession
} from '../../lib/auth/session';
import { AuthProvider } from '../../lib/auth/AuthContext';
import { requestWhoopLink } from '../../lib/api/whoop';
import { requestStravaLink } from '../../lib/api/strava';
import { Toaster } from '../ui/sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { parseDualEngineBody } from '../../lib/dashboardInsight';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

type AppState = 'landing' | 'auth' | 'authenticated';
type View =
  | 'dashboard'
  | 'labUpload'
  | 'protocols'
  | 'gym'
  | 'nutrition'
  | 'practitioner'
  | 'community'
  | 'settings'
  | 'integrations'
  | 'admin';

type ProfileSnapshot = Profile & {
  aiInterpretationApprovedAt?: string | null;
};

type OAuthProvider = 'whoop' | 'strava';
type OAuthErrorNotice = {
  provider: OAuthProvider;
  code: string;
  description?: string | null;
  hint?: string | null;
  state?: string | null;
  timestamp: string;
};

const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  whoop: 'Whoop',
  strava: 'Strava'
} as const;

const REQUIRED_CONSENT_TYPES = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'MEDICAL_DISCLAIMER'] as const;

const getLocalTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
};

const formatDateTimeLocal = (date: Date): string => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
};

const isSameUser = (a: SerializedUser | null | undefined, b: SerializedUser | null | undefined): boolean => {
  if (!a || !b) {
    return false;
  }

  return (
    a.id === b.id &&
    a.email === b.email &&
    a.role === b.role &&
    a.status === b.status &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  );
};

export default function AppContent() {
  const initialSession = useMemo(() => loadSession(), []);
  const [session, setSession] = useState<StoredSession | null>(initialSession);
  const [appState, setAppState] = useState<AppState>(initialSession ? 'authenticated' : 'landing');
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(initialSession?.user.status === 'PENDING_ONBOARDING');
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [longevityPlans, setLongevityPlans] = useState<LongevityPlan[] | null>(null);
  const [longevityPlansLoading, setLongevityPlansLoading] = useState(false);
  const [longevityPlanError, setLongevityPlanError] = useState<string | null>(null);
  const [longevityStacks, setLongevityStacks] = useState<LongevityStack[] | null>(null);
  const [longevityStacksLoading, setLongevityStacksLoading] = useState(false);
  const [longevityStacksError, setLongevityStacksError] = useState<string | null>(null);
  const [cohortBenchmarks, setCohortBenchmarks] = useState<CohortBenchmark[] | null>(null);
  const [cohortBenchmarksLoading, setCohortBenchmarksLoading] = useState(false);
  const [cohortBenchmarksError, setCohortBenchmarksError] = useState<string | null>(null);
  const [earlyWarnings, setEarlyWarnings] = useState<EarlyWarning[] | null>(null);
  const [earlyWarningsLoading, setEarlyWarningsLoading] = useState(false);
  const [earlyWarningsError, setEarlyWarningsError] = useState<string | null>(null);
  const [planRequesting, setPlanRequesting] = useState(false);
  const [profileSnapshot, setProfileSnapshot] = useState<ProfileSnapshot | null>(null);
  const t = useTranslation();
  const [showActionsDialog, setShowActionsDialog] = useState(false);
  const [showInsightDialog, setShowInsightDialog] = useState(false);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<DashboardActionItem | null>(null);
  const [showBiomarkerDialog, setShowBiomarkerDialog] = useState(false);
  const [biomarkerDefinitions, setBiomarkerDefinitions] = useState<BiomarkerDefinition[] | null>(null);
  const [biomarkerDefinitionsLoading, setBiomarkerDefinitionsLoading] = useState(false);
  const [biomarkerDefinitionsError, setBiomarkerDefinitionsError] = useState<string | null>(null);
  const [biomarkerFormError, setBiomarkerFormError] = useState<string | null>(null);
  const [biomarkerForm, setBiomarkerForm] = useState({
    biomarkerId: '',
    value: '',
    capturedAt: formatDateTimeLocal(new Date()),
    notes: ''
  });
  const [biomarkerSubmitting, setBiomarkerSubmitting] = useState(false);
  const [oauthError, setOauthError] = useState<OAuthErrorNotice | null>(null);
  const selectedBiomarker = useMemo(
    () => biomarkerDefinitions?.find((definition) => definition.id === biomarkerForm.biomarkerId) ?? null,
    [biomarkerDefinitions, biomarkerForm.biomarkerId]
  );
  const parsedInsightBody = useMemo(
    () => parseDualEngineBody(dashboardSummary?.todaysInsight?.body ?? null),
    [dashboardSummary?.todaysInsight?.body]
  );
  const [commandIndexing, setCommandIndexing] = useState(false);
  const oauthErrorSupportHref = useMemo(() => {
    if (!oauthError) {
      return 'mailto:support@biohax.pro';
    }
    const providerLabel = OAUTH_PROVIDER_LABELS[oauthError.provider];
    const subject = encodeURIComponent(`${providerLabel} OAuth error (${oauthError.code})`);
    const detailLines = [
      `Provider: ${providerLabel}`,
      `Error code: ${oauthError.code}`,
      oauthError.description ? `Description: ${oauthError.description}` : null,
      oauthError.hint ? `Hint: ${oauthError.hint}` : null,
      oauthError.state ? `State: ${oauthError.state}` : null,
      `Timestamp: ${oauthError.timestamp}`
    ]
      .filter(Boolean)
      .join('\n');
    const body = encodeURIComponent(
      `Hi BioHax support,\n\nI ran into this OAuth error while connecting ${providerLabel}:\n\n${detailLines}\n\n`
    );
    return `mailto:support@biohax.pro?subject=${subject}&body=${body}`;
  }, [oauthError]);
  const runCommandIndexing = useCallback(
    async (task: () => Promise<void> | void) => {
      setCommandIndexing(true);
      try {
        await task();
      } finally {
        setCommandIndexing(false);
      }
    },
    []
  );
  const isOnline = useNetworkStatus();
  useEffect(() => {
    const TOAST_ID = 'network-status';
    if (isOnline) {
      toast.dismiss(TOAST_ID);
      toast.success('Back online. Syncing the latest BioHax data…', { id: TOAST_ID });
    } else {
      toast.error('You are offline. BioHax will sync once you reconnect.', {
        id: TOAST_ID,
        duration: Infinity
      });
    }
  }, [isOnline]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    const providerMatch = [
      { path: '/oauth/whoop/callback', provider: 'whoop' as const },
      { path: '/oauth/strava/callback', provider: 'strava' as const }
    ].find((entry) => url.pathname === entry.path);

    if (!providerMatch) {
      return;
    }

    const errorCode = url.searchParams.get('error');
    if (!errorCode) {
      return;
    }

    setCurrentView('integrations');
    setOauthError({
      provider: providerMatch.provider,
      code: errorCode,
      description: url.searchParams.get('error_description'),
      hint: url.searchParams.get('error_hint'),
      state: url.searchParams.get('state'),
      timestamp: new Date().toISOString()
    });
    window.history.replaceState({}, '', '/integrations');
  }, []);
  const calendarEntries = useMemo(() => {
    if (!longevityPlans || longevityPlans.length === 0) {
      return [];
    }

    return longevityPlans.flatMap((plan) =>
      (plan.sections ?? []).flatMap((section, sectionIndex) =>
        section.interventions.map((intervention, interventionIndex) => ({
          id: `${plan.id}-${section.id ?? sectionIndex}-${intervention.id ?? interventionIndex}`,
          planTitle: plan.title,
          section: section.heading,
          recommendation: intervention.recommendation,
          evidence: intervention.evidence_strength,
          type: intervention.type
        }))
      )
    );
  }, [longevityPlans]);

  const currentUser: SerializedUser | null = session?.user ?? null;
  const isAdmin = currentUser?.role === 'ADMIN';

  const [adminAccess, setAdminAccess] = useState<AdminAccessSummary | null>(null);

  const allowAdminView = (adminAccess?.hasStaffAccess ?? false) || isAdmin;

  const navigationItems = useMemo(() => {
    const items = [
      { id: 'dashboard' as View, label: t.nav.dashboard, icon: Home },
      { id: 'labUpload' as View, label: t.nav.labUpload, icon: Beaker },
      { id: 'protocols' as View, label: t.nav.protocols, icon: Activity },
      { id: 'gym' as View, label: t.nav.gym, icon: Dumbbell },
      { id: 'nutrition' as View, label: t.nav.nutrition, icon: Apple },
      { id: 'practitioner' as View, label: t.nav.practitioner, icon: Users },
      { id: 'community' as View, label: t.nav.community, icon: Zap },
      { id: 'integrations' as View, label: t.nav.integrations, icon: Link2 },
      { id: 'settings' as View, label: t.nav.settings, icon: Settings }
    ];

    if (allowAdminView) {
      items.push({ id: 'admin' as View, label: t.nav.admin, icon: Shield });
    }

    return items;
  }, [
    allowAdminView,
    t.nav.admin,
    t.nav.community,
    t.nav.dashboard,
    t.nav.gym,
    t.nav.integrations,
    t.nav.labUpload,
    t.nav.nutrition,
    t.nav.practitioner,
    t.nav.protocols,
    t.nav.settings
  ]);

  const updateSession = useCallback((next: StoredSession | null) => {
    setSession(next);
    if (next) {
      persistSession(next);
    } else {
      clearPersistedSession();
    }
  }, []);

  const handleAuthSuccess = useCallback(
    (response: AuthResponse) => {
      const nextSession = createSessionFromAuthResponse(response);
      updateSession(nextSession);
      setAppState('authenticated');
    },
    [updateSession]
  );

  const ensureFreshSession = useCallback(async (): Promise<StoredSession> => {
    if (!session) {
      throw new Error('No active session');
    }

    if (session.tokens.accessTokenExpiresAt > Date.now()) {
      return session;
    }

    if (session.tokens.refreshTokenExpiresAt <= Date.now()) {
      updateSession(null);
      throw new Error('Session expired');
    }

    const refreshed = await refreshTokens(session.tokens.refreshToken);
    const nextSession: StoredSession = {
      user: session.user,
      tokens: normalizeTokens(refreshed)
    };
    updateSession(nextSession);
    return nextSession;
  }, [session, updateSession]);

  const syncUserProfile = useCallback(
    async (options: { requireActive?: boolean; throwOnError?: boolean } = {}) => {
      if (!session) {
        if (options.throwOnError) {
          throw new Error('No active session');
        }
        return null;
      }

      try {
        const freshSession = await ensureFreshSession();
        const remoteUser = await fetchCurrentUser(freshSession.tokens.accessToken);
        const tokensChanged = session.tokens !== freshSession.tokens;
        const userChanged = !isSameUser(session.user, remoteUser);

        if (tokensChanged || userChanged) {
          const mergedSession: StoredSession = {
            user: remoteUser,
            tokens: freshSession.tokens
          };
          updateSession(mergedSession);
        }

        if (options.requireActive && remoteUser.status !== 'ACTIVE') {
          throw new Error('Complete the onboarding steps to continue.');
        }

        return remoteUser;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          updateSession(null);
          setAppState('landing');
        } else {
          console.warn('Failed to sync user profile', error);
        }

        if (options.throwOnError) {
          throw error instanceof Error ? error : new Error('Unable to refresh your profile.');
        }

        return null;
      }
    },
    [session, ensureFreshSession, updateSession, setAppState]
  );

  const ensureOnboardingRequirements = useCallback(async () => {
    if (!session) {
      throw new Error('Please sign in again to continue onboarding.');
    }

    const freshSession = await ensureFreshSession();
    const profile = await fetchProfile(freshSession.tokens.accessToken);
    setProfileSnapshot(profile);

    if (!profile.baselineSurvey || Object.keys(profile.baselineSurvey).length === 0) {
      throw new Error('Save your health profile before completing onboarding.');
    }

    const resolvedTimezone =
      profile.timezone && profile.timezone.length > 0 ? profile.timezone : getLocalTimezone();

    const missingConsents = REQUIRED_CONSENT_TYPES.filter(
      (type) => !profile.consents.some((consent) => consent.type === type && consent.granted)
    );

    if (missingConsents.length === 0 && resolvedTimezone === profile.timezone) {
      return;
    }

    await updateProfile(freshSession.tokens.accessToken, {
      ...(resolvedTimezone !== profile.timezone ? { timezone: resolvedTimezone } : {}),
      ...(missingConsents.length > 0
        ? {
            consents: missingConsents.map<ConsentRecord>((type) => ({
              type,
              granted: true,
              grantedAt: new Date().toISOString(),
              metadata: { source: 'ONBOARDING_FLOW' }
            }))
          }
        : {})
    });
  }, [session, ensureFreshSession]);

  useEffect(() => {
    if (!session) {
      setAdminAccess(null);
      return;
    }

    syncUserProfile();
  }, [session, syncUserProfile]);

  useEffect(() => {
    if (!session) {
      setAdminAccess(null);
      return;
    }

    let cancelled = false;
    const loadAccess = async () => {
      try {
        const freshSession = await ensureFreshSession();
        const access = await fetchAdminAccess(freshSession.tokens.accessToken);
        if (!cancelled) {
          setAdminAccess(access);
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            setAdminAccess(null);
          } else {
            console.warn('Failed to sync admin access', error);
          }
        }
      }
    };

    void loadAccess();

    return () => {
      cancelled = true;
    };
  }, [session, ensureFreshSession]);

  useEffect(() => {
    if (!allowAdminView && currentView === 'admin') {
      setCurrentView('dashboard');
    }
  }, [allowAdminView, currentView]);

  const handleOnboardingComplete = useCallback(async () => {
    try {
      await ensureOnboardingRequirements();
      await syncUserProfile({ requireActive: true, throwOnError: true });
      toast.success('Onboarding complete. Your dashboard is unlocked.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to complete onboarding right now.';
      toast.error(message);
      throw error instanceof Error ? error : new Error(message);
    }
  }, [ensureOnboardingRequirements, syncUserProfile]);

  const loadDashboard = useCallback(async (): Promise<boolean> => {
    if (!session) {
      return false;
    }

    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const freshSession = await ensureFreshSession();
      const summary = await fetchDashboardSummary(freshSession.tokens.accessToken);
      setDashboardSummary(summary);
      return true;
    } catch (error) {
      setDashboardSummary(null);
      if (error instanceof ApiError) {
        if (error.code === 'ONBOARDING_REQUIRED') {
          setDashboardError('Complete onboarding to unlock personalized insights.');
        } else {
          setDashboardError(error.message);
        }
      } else {
        setDashboardError('Unable to load your dashboard right now.');
      }
      return false;
    } finally {
      setDashboardLoading(false);
    }
  }, [session, ensureFreshSession]);

  const loadLongevityPlans = useCallback(async () => {
    if (!session) {
      return;
    }

    setLongevityPlansLoading(true);
    setLongevityPlanError(null);

    try {
      const freshSession = await ensureFreshSession();
      const plans = await fetchLongevityPlans(freshSession.tokens.accessToken, 3);
      setLongevityPlans(plans);
    } catch (error) {
      setLongevityPlans(null);
      if (error instanceof ApiError) {
        setLongevityPlanError(error.message);
      } else {
        setLongevityPlanError('Unable to load longevity plans.');
      }
    } finally {
      setLongevityPlansLoading(false);
    }
  }, [session, ensureFreshSession]);

  const loadLongevityStacks = useCallback(async () => {
    if (!session) {
      return;
    }

    setLongevityStacksLoading(true);
    setLongevityStacksError(null);
    try {
      const freshSession = await ensureFreshSession();
      const stacks = await fetchLongevityStacks(freshSession.tokens.accessToken);
      setLongevityStacks(stacks);
    } catch (error) {
      setLongevityStacks(null);
      if (error instanceof ApiError) {
        setLongevityStacksError(error.message);
      } else {
        setLongevityStacksError('Unable to load longevity stacks.');
      }
    } finally {
      setLongevityStacksLoading(false);
    }
  }, [session, ensureFreshSession]);

  const loadProfileSnapshot = useCallback(async () => {
    if (!session) {
      return;
    }
    try {
      const freshSession = await ensureFreshSession();
      const profile = await fetchProfile(freshSession.tokens.accessToken);
      setProfileSnapshot(profile);
    } catch (error) {
      console.warn('Unable to load profile snapshot', error);
    }
  }, [session, ensureFreshSession]);

  const handleAiInterpretationRequest = useCallback(
    async (uploadId: string) => {
      if (!session) {
        throw new Error('Please sign in again to request interpretations.');
      }
      const freshSession = await ensureFreshSession();
      return requestAiInterpretationApi(freshSession.tokens.accessToken, uploadId);
    },
    [session, ensureFreshSession]
  );

  const loadCohortBenchmarks = useCallback(async () => {
    if (!session) {
      return;
    }
    setCohortBenchmarksLoading(true);
    setCohortBenchmarksError(null);
    try {
      const freshSession = await ensureFreshSession();
      const benchmarks = await fetchCohortBenchmarks(freshSession.tokens.accessToken);
      setCohortBenchmarks(benchmarks);
    } catch (error) {
      setCohortBenchmarksError(error instanceof Error ? error.message : 'Unable to load cohort benchmarks.');
    } finally {
      setCohortBenchmarksLoading(false);
    }
  }, [session, ensureFreshSession]);

  const loadEarlyWarnings = useCallback(async () => {
    if (!session) {
      return;
    }
    setEarlyWarningsLoading(true);
    setEarlyWarningsError(null);
    try {
      const freshSession = await ensureFreshSession();
      const warnings = await fetchEarlyWarnings(freshSession.tokens.accessToken);
      setEarlyWarnings(warnings);
    } catch (error) {
      setEarlyWarningsError(error instanceof Error ? error.message : 'Unable to load early-warning signals.');
    } finally {
      setEarlyWarningsLoading(false);
    }
  }, [session, ensureFreshSession]);

  const requestLongevityPlanGeneration = useCallback(async () => {
    if (!session) {
      return;
    }

    setPlanRequesting(true);
    try {
      const freshSession = await ensureFreshSession();
      const focusAreas =
        dashboardSummary?.biomarkerTrends?.slice(0, 2)?.map((trend) => trend.biomarker.slug) ?? [];

      await requestLongevityPlan(freshSession.tokens.accessToken, {
        focusAreas,
        includeWearables: true
      });
      toast.success('Longevity plan queued. You will be notified when it is ready.');
      await loadLongevityPlans();
    } catch (error) {
      console.error('Failed to request longevity plan', error);
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error('Unable to request a longevity plan right now.');
      }
    } finally {
      setPlanRequesting(false);
    }
  }, [session, ensureFreshSession, dashboardSummary, loadLongevityPlans]);

  const handleViewActions = useCallback(() => {
    setShowActionsDialog(true);
  }, []);

  const handleViewInsight = useCallback(() => {
    setShowInsightDialog(true);
  }, []);

  const handleViewCalendar = useCallback(() => {
    setShowCalendarDialog(true);
  }, []);

  const handleCommandRefresh = useCallback(() => {
    return runCommandIndexing(async () => {
      await Promise.all([
        loadDashboard(),
        loadLongevityPlans(),
        loadLongevityStacks(),
        loadCohortBenchmarks(),
        loadEarlyWarnings()
      ]);
    });
  }, [
    runCommandIndexing,
    loadDashboard,
    loadLongevityPlans,
    loadLongevityStacks,
    loadCohortBenchmarks,
    loadEarlyWarnings
  ]);

  const notificationCount = dashboardSummary?.actionItems?.length ?? 0;

  const handleDashboardAction = useCallback(
    (action: DashboardActionItem) => {
      setShowActionsDialog(false);
      switch (action.ctaType) {
        case 'LOG_BIOMARKER':
          setPendingAction(action);
          setShowBiomarkerDialog(true);
          break;
        case 'REVIEW_INSIGHT':
          setShowInsightDialog(true);
          break;
        case 'JOIN_FEED_DISCUSSION':
          setCurrentView('community');
          break;
      }
    },
    [setCurrentView]
  );

  const openBiomarkerLog = useCallback(
    (definition?: BiomarkerDefinition | null) => {
      setPendingAction(null);
      setBiomarkerFormError(null);
      setBiomarkerForm((previous) => ({
        ...previous,
        biomarkerId: definition?.id ?? previous.biomarkerId,
        value: '',
        notes: ''
      }));
      setShowBiomarkerDialog(true);
    },
    [setBiomarkerForm, setBiomarkerFormError, setPendingAction, setShowBiomarkerDialog]
  );

  const handleOpenNotifications = useCallback(async () => {
    if (!session) {
      setAppState('auth');
      return;
    }

    try {
      await runCommandIndexing(async () => {
        const indexed = await loadDashboard();
        if (!indexed) {
          throw new Error('Unable to refresh notifications right now.');
        }
        setShowOnboarding(false);
        setCurrentView('dashboard');
        setShowActionsDialog(true);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to open notifications right now.';
      toast.error(message);
    }
  }, [session, setAppState, runCommandIndexing, loadDashboard, setShowOnboarding, setCurrentView, setShowActionsDialog]);

  const handleOpenProfile = useCallback(async () => {
    if (!session) {
      setAppState('auth');
      return;
    }

    try {
      await runCommandIndexing(async () => {
        await syncUserProfile({ throwOnError: true });
        setShowOnboarding(false);
        setCurrentView('settings');
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to open profile right now.';
      toast.error(message);
    }
  }, [session, setAppState, runCommandIndexing, syncUserProfile, setShowOnboarding, setCurrentView]);

  const handleLogout = useCallback(async () => {
    if (session) {
      try {
        const freshSession = await ensureFreshSession().catch(() => null);
        const accessToken = freshSession?.tokens.accessToken ?? session.tokens.accessToken;
        await logoutUser(accessToken, session.tokens.refreshToken);
      } catch (error) {
        console.warn('Failed to log out cleanly', error);
      }
    }

    updateSession(null);
    setDashboardSummary(null);
    setLongevityPlans(null);
    setAppState('landing');
    setCurrentView('dashboard');
    setShowOnboarding(false);
  }, [session, ensureFreshSession, updateSession]);

  const handleNavigate = useCallback(
    (nextView: string) => {
      setCurrentView(nextView as View);
    },
    []
  );

  const commandGroups = useMemo<CommandGroupDescriptor[]>(() => {
    const groups: CommandGroupDescriptor[] = [];

    const quickCommands: CommandActionDescriptor[] = [
      {
        id: 'refresh-data',
        label: 'Refresh BioHax data',
        description: 'Sync dashboard, plans, stacks, and warnings',
        icon: RefreshCcw,
        disabled: commandIndexing,
        onSelect: handleCommandRefresh
      },
      {
        id: 'open-actions',
        label: 'Open daily actions',
        description:
          notificationCount === 0
            ? 'No pending recommendations'
            : `${notificationCount} pending recommendation${notificationCount === 1 ? '' : 's'}`,
        icon: ListChecks,
        disabled: notificationCount === 0,
        onSelect: handleViewActions
      },
      {
        id: 'todays-insight',
        label: "Review today's insight",
        description: dashboardSummary?.todaysInsight?.title ?? 'AI insight summary',
        icon: Sparkles,
        disabled: !dashboardSummary?.todaysInsight,
        onSelect: handleViewInsight
      },
      {
        id: 'plan-calendar',
        label: 'Open plan calendar',
        description: 'View upcoming interventions',
        icon: CalendarClock,
        onSelect: handleViewCalendar
      },
      {
        id: 'request-plan',
        label: 'Request new longevity plan',
        description: 'Queue AI regimen using latest biomarkers',
        icon: Sparkles,
        disabled: planRequesting,
        onSelect: requestLongevityPlanGeneration
      },
      {
        id: 'log-biomarker',
        label: 'Log biomarker manually',
        description: selectedBiomarker ? `Last selected: ${selectedBiomarker.name}` : 'Track a new measurement',
        icon: Droplet,
        onSelect: () => openBiomarkerLog(selectedBiomarker)
      },
      {
        id: 'open-notifications',
        label: 'Open notifications',
        description: 'Show latest alerts and tasks',
        icon: Bell,
        onSelect: handleOpenNotifications
      },
      {
        id: 'open-profile',
        label: 'Open profile & settings',
        description: 'Manage account preferences',
        icon: UserRound,
        onSelect: handleOpenProfile
      }
    ];

    if (session) {
      quickCommands.push({
        id: 'sign-out',
        label: 'Sign out',
        description: 'Log out of BioHax',
        icon: ArrowRightFromLine,
        onSelect: handleLogout
      });
    }

    if (quickCommands.length > 0) {
      groups.push({
        id: 'quick-actions',
        title: 'Quick actions',
        commands: quickCommands
      });
    }

    const navigationCommands: CommandActionDescriptor[] = navigationItems.map((item) => ({
      id: `nav-${item.id}`,
      label: item.label,
      description: item.id === currentView ? 'Currently viewing' : 'Jump to this view',
      icon: item.icon,
      disabled: currentView === item.id,
      onSelect: () => handleNavigate(item.id)
    }));

    if (navigationCommands.length > 0) {
      groups.push({
        id: 'navigation',
        title: 'Navigate',
        commands: navigationCommands
      });
    }

    const actionTypeLabels: Record<DashboardActionItem['ctaType'], string> = {
      LOG_BIOMARKER: 'Log biomarker',
      REVIEW_INSIGHT: 'Review insight',
      JOIN_FEED_DISCUSSION: 'Community'
    };

    const actionIcons: Record<DashboardActionItem['ctaType'], CommandActionDescriptor['icon']> = {
      LOG_BIOMARKER: Droplet,
      REVIEW_INSIGHT: Sparkles,
      JOIN_FEED_DISCUSSION: Users
    };

    const actionItemCommands: CommandActionDescriptor[] =
      (dashboardSummary?.actionItems ?? []).map((action) => ({
        id: `action-${action.id}`,
        label: action.title,
        description: action.description,
        icon: actionIcons[action.ctaType],
        badge: actionTypeLabels[action.ctaType],
        onSelect: () => handleDashboardAction(action)
      })) ?? [];

    if (actionItemCommands.length > 0) {
      groups.push({
        id: 'action-items',
        title: 'Action items',
        commands: actionItemCommands
      });
    }

    const biomarkerCommands: CommandActionDescriptor[] =
      (biomarkerDefinitions ?? [])
        .slice(0, 8)
        .map((definition) => ({
          id: `biomarker-${definition.id}`,
          label: `Log ${definition.name}`,
          description: definition.unit ? `Unit: ${definition.unit}` : undefined,
          icon: Droplet,
          onSelect: () => openBiomarkerLog(definition)
        })) ?? [];

    if (biomarkerCommands.length > 0) {
      groups.push({
        id: 'biomarkers',
        title: 'Biomarkers',
        commands: biomarkerCommands
      });
    }

    const planCommands: CommandActionDescriptor[] =
      (longevityPlans ?? []).map((plan) => ({
        id: `plan-${plan.id}`,
        label: plan.title,
        description:
          plan.status === 'READY'
            ? 'Ready for review'
            : plan.status === 'PROCESSING'
              ? 'Processing'
              : plan.status === 'FAILED'
                ? 'Failed — retry soon'
                : 'Draft plan',
        icon: Sparkles,
        badge: plan.status,
        onSelect: () => handleNavigate('protocols')
      })) ?? [];

    if (planCommands.length > 0) {
      groups.push({
        id: 'plans',
        title: 'Longevity plans',
        commands: planCommands
      });
    }

    return groups;
  }, [
    commandIndexing,
    handleCommandRefresh,
    handleViewActions,
    dashboardSummary,
    handleViewInsight,
    handleViewCalendar,
    planRequesting,
    requestLongevityPlanGeneration,
    selectedBiomarker,
    openBiomarkerLog,
    handleOpenNotifications,
    handleOpenProfile,
    session,
    handleLogout,
    navigationItems,
    currentView,
    handleNavigate,
    biomarkerDefinitions,
    handleDashboardAction,
    longevityPlans,
    notificationCount
  ]);

  const handleSubmitBiomarkerLog = useCallback(async () => {
    if (!session) {
      toast.error('Please sign in again to log a biomarker.');
      return;
    }

    if (!biomarkerForm.biomarkerId) {
      setBiomarkerFormError('Select a biomarker to log.');
      return;
    }

    const numericValue = Number(biomarkerForm.value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setBiomarkerFormError('Enter a value greater than zero.');
      return;
    }

    setBiomarkerFormError(null);
    setBiomarkerSubmitting(true);
    try {
      const freshSession = await ensureFreshSession();
      await createManualBiomarkerLog(freshSession.tokens.accessToken, {
        biomarkerId: biomarkerForm.biomarkerId,
        value: numericValue,
        unit: selectedBiomarker?.unit ?? undefined,
        capturedAt: new Date(biomarkerForm.capturedAt).toISOString(),
        source: 'MANUAL',
        notes: biomarkerForm.notes.trim() ? biomarkerForm.notes.trim() : undefined
      });
      toast.success('Biomarker logged successfully.');
      setShowBiomarkerDialog(false);
      await loadDashboard();
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error('Unable to log biomarker. Please try again.');
      }
    } finally {
      setBiomarkerSubmitting(false);
    }
  }, [session, biomarkerForm, selectedBiomarker, ensureFreshSession, loadDashboard]);

  useEffect(() => {
    if (session && appState === 'authenticated') {
      loadDashboard();
      loadLongevityPlans();
      loadLongevityStacks();
      loadProfileSnapshot();
      loadCohortBenchmarks();
      loadEarlyWarnings();
    }
  }, [
    session,
    appState,
    loadDashboard,
    loadLongevityPlans,
    loadLongevityStacks,
    loadProfileSnapshot,
    loadCohortBenchmarks,
    loadEarlyWarnings
  ]);

  useEffect(() => {
    if (!showBiomarkerDialog || !session) {
      return;
    }

    if (biomarkerDefinitions && biomarkerDefinitions.length > 0) {
      return;
    }

    let cancelled = false;
    const loadDefinitions = async () => {
      setBiomarkerDefinitionsLoading(true);
      setBiomarkerDefinitionsError(null);
      try {
        const freshSession = await ensureFreshSession();
        const definitions = await listBiomarkerDefinitions(freshSession.tokens.accessToken);
        if (cancelled) {
          return;
        }
        setBiomarkerDefinitions(definitions);
        setBiomarkerForm((previous) => ({
          ...previous,
          biomarkerId: previous.biomarkerId || definitions[0]?.id || ''
        }));
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError) {
            setBiomarkerDefinitionsError(error.message);
          } else {
            setBiomarkerDefinitionsError('Unable to load biomarkers.');
          }
        }
      } finally {
        if (!cancelled) {
          setBiomarkerDefinitionsLoading(false);
        }
      }
    };

    void loadDefinitions();

    return () => {
      cancelled = true;
    };
  }, [
    showBiomarkerDialog,
    session,
    biomarkerDefinitions,
    ensureFreshSession
  ]);

  useEffect(() => {
    if (showBiomarkerDialog) {
      return;
    }

    setPendingAction((current) => (current?.ctaType === 'LOG_BIOMARKER' ? null : current));
    setBiomarkerForm({
      biomarkerId: biomarkerDefinitions?.[0]?.id ?? '',
      value: '',
      capturedAt: formatDateTimeLocal(new Date()),
      notes: ''
    });
    setBiomarkerFormError(null);
    setBiomarkerSubmitting(false);
  }, [showBiomarkerDialog, biomarkerDefinitions]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<View | { view?: View }>;
      const detail = typeof customEvent.detail === 'string' ? customEvent.detail : customEvent.detail?.view;
      if (!detail) {
        return;
      }
      const isAllowed = navigationItems.some((item) => item.id === detail);
      if (isAllowed) {
        setCurrentView(detail);
      }
    };

    window.addEventListener('biohax:navigate', handleNavigate as EventListener);
    return () => {
      window.removeEventListener('biohax:navigate', handleNavigate as EventListener);
    };
  }, [navigationItems]);

  const welcomeName = useMemo(() => {
    if (!currentUser) {
      return 'Biohacker';
    }
    const emailPrefix = currentUser.email?.split('@')[0] ?? 'Member';
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }, [currentUser]);

  const profileInitials = useMemo(() => {
    if (!currentUser?.email) {
      return 'BH';
    }
    const [localPart] = currentUser.email.split('@');
    if (!localPart) {
      return 'BH';
    }

    const letters = localPart
      .split(/[\W_]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase())
      .join('');

    return letters.slice(0, 2) || 'BH';
  }, [currentUser]);

  const authValue = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      ensureAccessToken: async () => {
        const freshSession = await ensureFreshSession();
        return freshSession.tokens.accessToken;
      },
      refreshUserProfile: syncUserProfile,
      logout: handleLogout
    }),
    [session, ensureFreshSession, syncUserProfile, handleLogout]
  );

  useEffect(() => {
    if (!session) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.pathname !== '/oauth/whoop/callback') {
      return;
    }
    if (url.searchParams.get('error')) {
      return;
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) {
      return;
    }

    const completeLink = async () => {
      try {
        const freshSession = await ensureFreshSession();
        await requestWhoopLink(freshSession.tokens.accessToken, {
          authorizationCode: code,
          state
        });
        toast.success('Whoop account linked');
        await loadDashboard();
      } catch (error) {
        console.error('Failed to complete Whoop link', error);
        toast.error('Unable to complete Whoop linking. Please try again.');
      } finally {
        window.history.replaceState({}, '', '/');
      }
    };

    void completeLink();
  }, [session, ensureFreshSession, loadDashboard]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.pathname !== '/oauth/strava/callback') {
      return;
    }
    if (url.searchParams.get('error')) {
      return;
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) {
      return;
    }

    const completeLink = async () => {
      try {
        const freshSession = await ensureFreshSession();
        await requestStravaLink(freshSession.tokens.accessToken, {
          authorizationCode: code,
          state
        });
        toast.success('Strava account linked');
        await loadDashboard();
      } catch (error) {
        console.error('Failed to complete Strava link', error);
        toast.error('Unable to complete Strava linking. Please try again.');
      } finally {
        window.history.replaceState({}, '', '/');
      }
    };

    void completeLink();
  }, [session, ensureFreshSession, loadDashboard]);

  // Landing/Auth Flow
  const handleDismissOAuthError = useCallback(() => {
    setOauthError(null);
    setCurrentView('integrations');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/integrations');
    }
  }, [setCurrentView]);

  const renderDashboard = () => (
    <Dashboard
      userName={welcomeName}
      summary={dashboardSummary}
      loading={dashboardLoading}
      error={dashboardError}
      onRetry={loadDashboard}
      plans={longevityPlans}
      planLoading={longevityPlansLoading}
      planError={longevityPlanError}
      onPlanRetry={loadLongevityPlans}
      onRequestPlan={requestLongevityPlanGeneration}
      planRequesting={planRequesting}
      stacks={longevityStacks}
      stacksLoading={longevityStacksLoading}
      stacksError={longevityStacksError}
      onStackRetry={loadLongevityStacks}
      cohortBenchmarks={cohortBenchmarks}
      cohortBenchmarksLoading={cohortBenchmarksLoading}
      cohortBenchmarksError={cohortBenchmarksError}
      onBenchmarkRetry={loadCohortBenchmarks}
      earlyWarnings={earlyWarnings}
      earlyWarningsLoading={earlyWarningsLoading}
      earlyWarningsError={earlyWarningsError}
      onEarlyWarningRetry={loadEarlyWarnings}
      onViewActions={handleViewActions}
      onViewCalendar={handleViewCalendar}
      onViewInsight={handleViewInsight}
      onActionSelect={handleDashboardAction}
    />
  );

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return renderDashboard();
      case 'labUpload':
        return (
          <LabUploadPage
            aiInterpretationApproved={Boolean(profileSnapshot?.aiInterpretationApprovedAt)}
            onRequestInterpretation={handleAiInterpretationRequest}
          />
        );
      case 'protocols':
        return <ProtocolsView />;
      case 'gym':
        return <GymWorkoutCreator />;
      case 'nutrition':
        return <NutritionView />;
      case 'practitioner':
        return <PractitionerWorkspace />;
      case 'community':
        return <CommunityFeed />;
      case 'settings':
        return <SettingsPage />;
      case 'integrations':
        return <IntegrationsPage />;
      case 'admin':
        return allowAdminView ? <AdminDashboard /> : renderDashboard();
      default:
        return renderDashboard();
    }
  };

  if (appState === 'landing') {
    return (
      <>
        <LandingPage
          onGetStarted={() => setAppState('auth')}
          onSignIn={() => setAppState('auth')}
        />
        <Toaster />
      </>
    );
  }

  if (appState === 'auth') {
    return (
      <>
        <AuthScreen onAuth={handleAuthSuccess} onBack={() => setAppState('landing')} />
        <Toaster />
      </>
    );
  }

  return (
    <AuthProvider value={authValue}>
      <div className="flex min-h-screen bg-background">
        <VerticalNav items={navigationItems} currentView={currentView} onNavigate={handleNavigate} />

        <div className="flex min-h-screen w-full flex-1 flex-col">
          <CommandBar
            onOpenNotifications={handleOpenNotifications}
            onOpenProfile={handleOpenProfile}
            profileInitials={profileInitials}
            onSignOut={handleLogout}
            isAuthenticated={Boolean(session)}
            isIndexing={commandIndexing}
            notificationCount={notificationCount}
            commandGroups={commandGroups}
            lastIndexedAt={dashboardSummary?.generatedAt ?? null}
            isOnline={isOnline}
          />

          <main className="flex-1 w-full pb-28 pt-6">{renderView()}</main>

          {showOnboarding && (
            <OnboardingFlow
              onComplete={handleOnboardingComplete}
              onDismiss={session?.user.status === 'ACTIVE' ? () => setShowOnboarding(false) : undefined}
            />
          )}
        </div>
      </div>

      <Dialog open={showActionsDialog} onOpenChange={setShowActionsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Daily Actions</DialogTitle>
              <DialogDescription>These recommendations update whenever your dashboard refreshes.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {(dashboardSummary?.actionItems ?? []).length === 0 ? (
                <div className="rounded-xl border border-cloud p-4 text-steel text-sm">
                  You're all caught up. New actions will appear once fresh data is available.
                </div>
              ) : (
                (dashboardSummary?.actionItems ?? []).map((action) => (
                  <div key={action.id} className="rounded-xl border border-cloud p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-ink">{action.title}</div>
                      <p className="text-sm text-steel">{action.description}</p>
                    </div>
                    <Button variant="outline" onClick={() => handleDashboardAction(action)}>
                      {action.ctaType === 'JOIN_FEED_DISCUSSION' && 'Open Community'}
                      {action.ctaType === 'LOG_BIOMARKER' && 'Log Biomarker'}
                      {action.ctaType === 'REVIEW_INSIGHT' && 'Review Insight'}
                      {!['JOIN_FEED_DISCUSSION', 'LOG_BIOMARKER', 'REVIEW_INSIGHT'].includes(action.ctaType) && 'Open'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showInsightDialog} onOpenChange={setShowInsightDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{dashboardSummary?.todaysInsight?.title ?? 'AI insight unavailable'}</DialogTitle>
              <DialogDescription>
                {dashboardSummary?.todaysInsight
                  ? `Generated ${new Date(dashboardSummary.todaysInsight.generatedAt).toLocaleString()}`
                  : 'Connect a wearable or upload labs to generate insights.'}
              </DialogDescription>
            </DialogHeader>
            {dashboardSummary?.todaysInsight ? (
              <div className="space-y-6">
                <p className="text-steel leading-relaxed">{dashboardSummary.todaysInsight.summary}</p>
                {parsedInsightBody.insights.length > 0 && (
                  <div className="rounded-xl border border-cloud p-4">
                    <div className="text-xs font-semibold text-steel mb-2">Model highlights</div>
                    <ul className="space-y-2 text-sm text-ink list-disc pl-4">
                      {parsedInsightBody.insights.map((item, index) => (
                        <li key={`insight-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {parsedInsightBody.recommendations.length > 0 && (
                  <div className="rounded-xl border border-electric/40 bg-electric/5 p-4">
                    <div className="text-xs font-semibold text-electric mb-2">Suggested actions</div>
                    <ul className="space-y-2 text-sm text-ink list-disc pl-4">
                      {parsedInsightBody.recommendations.map((item, index) => (
                        <li key={`action-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {parsedInsightBody.metadata && (
                  <div className="rounded-xl border border-cloud p-4 space-y-2 text-sm">
                    <div className="font-semibold text-ink">Dual-engine validation</div>
                    <p>
                      Confidence: <span className="font-bold">{Math.round(parsedInsightBody.metadata.confidenceScore * 100)}%</span>
                    </p>
                    <p>
                      Agreement ratio:{' '}
                      <span className="font-bold">
                        {Math.round(parsedInsightBody.metadata.agreementRatio * 100)}%
                      </span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-cloud p-6 text-center text-sm text-steel">
                Generate a longevity insight to unlock full analysis.
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showCalendarDialog} onOpenChange={setShowCalendarDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Plan Calendar</DialogTitle>
              <DialogDescription>Upcoming interventions pulled from your latest longevity plan.</DialogDescription>
            </DialogHeader>
            {calendarEntries.length === 0 ? (
              <div className="rounded-xl border border-cloud p-6 text-center text-sm text-steel">
                Generate a plan to populate your schedule.
              </div>
            ) : (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {calendarEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-cloud p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="font-semibold text-ink">{entry.recommendation}</div>
                      <span className="text-xs font-semibold text-electric bg-electric/10 px-2 py-1 rounded-lg">{entry.type}</span>
                    </div>
                    <p className="text-sm text-steel">
                      {entry.section} • {entry.planTitle}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showBiomarkerDialog} onOpenChange={setShowBiomarkerDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Log biomarker</DialogTitle>
              <DialogDescription>
                {pendingAction?.description ?? 'Store a manual reading to refresh your dashboard.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {biomarkerDefinitionsError && (
                <div className="rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse">
                  {biomarkerDefinitionsError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="biomarker-select">Biomarker</Label>
                <Select
                  value={biomarkerForm.biomarkerId}
                  onValueChange={(value) => setBiomarkerForm((previous) => ({ ...previous, biomarkerId: value }))}
                  disabled={biomarkerDefinitionsLoading || !biomarkerDefinitions?.length}
                >
                  <SelectTrigger id="biomarker-select">
                    <SelectValue placeholder="Select biomarker" />
                  </SelectTrigger>
                  <SelectContent>
                    {(biomarkerDefinitions ?? []).map((definition) => (
                      <SelectItem key={definition.id} value={definition.id}>
                        {definition.name} ({definition.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="biomarker-value">Value {selectedBiomarker ? `(${selectedBiomarker.unit})` : ''}</Label>
                <Input
                  id="biomarker-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={biomarkerForm.value}
                  onChange={(event) => setBiomarkerForm((previous) => ({ ...previous, value: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="biomarker-captured-at">Captured at</Label>
                <Input
                  id="biomarker-captured-at"
                  type="datetime-local"
                  value={biomarkerForm.capturedAt}
                  onChange={(event) => setBiomarkerForm((previous) => ({ ...previous, capturedAt: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="biomarker-notes">Notes</Label>
                <Textarea
                  id="biomarker-notes"
                  rows={3}
                  value={biomarkerForm.notes}
                  onChange={(event) => setBiomarkerForm((previous) => ({ ...previous, notes: event.target.value }))}
                  placeholder="Optional context for this measurement"
                />
              </div>
              {biomarkerFormError && <p className="text-sm text-pulse">{biomarkerFormError}</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowBiomarkerDialog(false)} disabled={biomarkerSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmitBiomarkerLog} disabled={biomarkerSubmitting || biomarkerDefinitionsLoading}>
                {biomarkerSubmitting ? 'Logging…' : 'Log biomarker'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(oauthError)} onOpenChange={(open) => (!open ? handleDismissOAuthError() : undefined)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {oauthError ? `${OAUTH_PROVIDER_LABELS[oauthError.provider]} connection failed` : 'OAuth failed'}
              </DialogTitle>
              <DialogDescription>
                We couldn't finish the secure redirect. The provider sent back the details below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3">
                <p className="text-sm font-semibold text-pulse">
                  {oauthError?.description ?? 'The provider returned an unspecified error.'}
                </p>
                {oauthError?.hint && <p className="mt-2 text-xs text-steel">{oauthError.hint}</p>}
                <div className="mt-3 space-y-1 text-xs text-steel">
                  {oauthError && (
                    <>
                      <div>
                        Error code:{' '}
                        <span className="font-mono text-ink">{oauthError.code}</span>
                      </div>
                      {oauthError.state && (
                        <div className="break-all">
                          Session state: <span className="font-mono text-ink">{oauthError.state}</span>
                        </div>
                      )}
                      <div>Timestamp: {new Date(oauthError.timestamp).toLocaleString()}</div>
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm text-steel">
                Retry from the Integrations tab. If this keeps happening, share the error details with BioHax support so we
                can escalate it with {oauthError ? OAUTH_PROVIDER_LABELS[oauthError.provider] : 'the provider'}.
              </p>
            </div>
            <DialogFooter className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={handleDismissOAuthError}>
                Back to Integrations
              </Button>
              <Button asChild variant="ghost">
                <a href={oauthErrorSupportHref} target="_blank" rel="noreferrer">
                  Email support
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Toaster />
    </AuthProvider>
  );
}
