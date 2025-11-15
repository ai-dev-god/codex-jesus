import { useState } from 'react';
import { Activity, Users, Zap, Settings, Link2, Home, Dumbbell, Apple } from 'lucide-react';
import { Toaster } from '../ui/sonner';
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

type AppState = 'landing' | 'auth' | 'authenticated';
type View = 'dashboard' | 'protocols' | 'gym' | 'nutrition' | 'practitioner' | 'community' | 'settings' | 'integrations';

export default function AppContent() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
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
        <AuthScreen 
          onAuth={() => {
            setAppState('authenticated');
            setShowOnboarding(true);
          }}
          onBack={() => setAppState('landing')}
        />
        <Toaster />
      </>
    );
  }

  // Authenticated App
  const renderView = () => {
    if (showOnboarding) {
      return <OnboardingFlow onComplete={() => setShowOnboarding(false)} />;
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
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
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Vertical Navigation */}
      <VerticalNav 
        items={navigationItems} 
        currentView={currentView} 
        onNavigate={setCurrentView} 
      />

      {/* Command Bar */}
      <CommandBar onNavigate={setCurrentView} />

      {/* Main Content */}
      <main>
        {renderView()}
      </main>

      <Toaster />
    </div>
  );
}
