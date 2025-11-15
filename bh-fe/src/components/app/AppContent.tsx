import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Users, Zap, Settings, Link2, Home, Dumbbell, Apple, LogOut } from 'lucide-react';
import { toast } from 'sonner';

import VerticalNav from '../layout/VerticalNav';
import CommandBar from '../layout/CommandBar';
import LandingPage from '../landing/LandingPage';
import AuthScreen from '../auth/AuthScreen';
import Dashboard from '../dashboard/Dashboard';
import OnboardingFlow from '../onboarding/OnboardingFlow';
import ProtocolsView from '../protocols/ProtocolsView';
import PractitionerWorkspace from '../practitioner/PractitionerWorkspace';
import CommunityFeed from '../community/CommunityFeed';
import SettingsPage from '../settings/SettingsPage';
import IntegrationsPage from '../integrations/IntegrationsPage';
import GymWorkoutCreator from '../gym/GymWorkoutCreator';
import NutritionView from '../nutrition/NutritionView';
import { useTranslation } from '../../lib/i18n/LanguageContext';
import type { AuthResponse, DashboardSummary, LongevityPlan, SerializedUser } from '../../lib/api/types';
import { fetchDashboardSummary } from '../../lib/api/dashboard';
import { fetchCurrentUser, logoutUser, refreshTokens } from '../../lib/api/auth';
import { ApiError } from '../../lib/api/error';
import { fetchLongevityPlans, requestLongevityPlan } from '../../lib/api/ai';
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
import { Toaster } from '../ui/sonner';

type AppState = 'landing' | 'auth' | 'authenticated';
type View = 'dashboard' | 'protocols' | 'gym' | 'nutrition' | 'practitioner' | 'community' | 'settings' | 'integrations';

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
  const [planRequesting, setPlanRequesting] = useState(false);
  const t = useTranslation();

  const navigationItems = [
    { id: 'dashboard' as View, label: t.nav.dashboard, icon: Home },
    { id: 'protocols' as View, label: t.nav.protocols, icon: Activity },
    { id: 'gym' as View, label: t.nav.gym, icon: Dumbbell },
    { id: 'nutrition' as View, label: t.nav.nutrition, icon: Apple },
    { id: 'practitioner' as View, label: t.nav.practitioner, icon: Users },
    { id: 'community' as View, label: t.nav.community, icon: Zap },
    { id: 'integrations' as View, label: t.nav.integrations, icon: Link2 },
    { id: 'settings' as View, label: t.nav.settings, icon: Settings },
  ];

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
      setShowOnboarding(response.user.status !== 'ACTIVE');
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

  const syncUserProfile = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const freshSession = await ensureFreshSession();
      const remoteUser = await fetchCurrentUser(freshSession.tokens.accessToken);
      const mergedSession: StoredSession = {
        user: remoteUser,
        tokens: freshSession.tokens
      };
      updateSession(mergedSession);
      if (remoteUser.status === 'ACTIVE') {
        setShowOnboarding(false);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        updateSession(null);
        setAppState('landing');
      } else {
        console.warn('Failed to sync user profile', error);
      }
    }
  }, [session, ensureFreshSession, updateSession]);

  useEffect(() => {
    if (!session) {
      return;
    }

    syncUserProfile();
  }, [session, syncUserProfile]);

  const loadDashboard = useCallback(async () => {
    if (!session) {
      return;
    }

    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const freshSession = await ensureFreshSession();
      const summary = await fetchDashboardSummary(freshSession.tokens.accessToken);
      setDashboardSummary(summary);
    } catch (error) {
      setDashboardSummary(null);
      if (error instanceof ApiError) {
        if (error.code === 'ONBOARDING_REQUIRED') {
          setShowOnboarding(true);
          setDashboardError('Complete onboarding to unlock personalized insights.');
        } else {
          setDashboardError(error.message);
        }
      } else {
        setDashboardError('Unable to load your dashboard right now.');
      }
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

  useEffect(() => {
    if (session && appState === 'authenticated') {
      loadDashboard();
      loadLongevityPlans();
    }
  }, [session, appState, loadDashboard, loadLongevityPlans]);

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

  // Landing/Auth Flow
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

  const currentUser: SerializedUser | null = session?.user ?? null;
  const welcomeName = useMemo(() => {
    if (!currentUser) {
      return 'Biohacker';
    }
    const emailPrefix = currentUser.email?.split('@')[0] ?? 'Member';
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }, [currentUser]);

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
    />
  );

  const renderView = () => {
    if (showOnboarding) {
      return <OnboardingFlow onComplete={() => setShowOnboarding(false)} />;
    }

    switch (currentView) {
      case 'dashboard':
        return renderDashboard();
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
      default:
        return renderDashboard();
    }
  };

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

  return (
    <AuthProvider value={authValue}>
      <div className="min-h-screen bg-background">
        {session && (
          <div className="fixed top-6 right-6 z-50">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/80 backdrop-blur px-4 py-2 text-sm font-semibold text-ink border border-cloud shadow-lg hover:bg-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
        {/* Vertical Navigation */}
        <VerticalNav items={navigationItems} currentView={currentView} onNavigate={setCurrentView} />

        {/* Command Bar */}
        <CommandBar onStartOnboarding={() => setShowOnboarding(true)} />

        {/* Main Content */}
        <main>{renderView()}</main>

        <Toaster />
      </div>
    </AuthProvider>
  );
}
