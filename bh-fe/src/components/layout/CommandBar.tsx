import { useState } from 'react';
import { Search, Zap, Bell, Loader2, LogOut, type LucideIcon } from 'lucide-react';

export type CommandBarMetric = {
  id: string;
  label: string;
  value: string;
  helper?: string;
  trend?: number | null;
  icon: LucideIcon;
};

interface CommandBarProps {
  onStartOnboarding: () => void;
  onboardingActive?: boolean;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  profileInitials?: string;
  onSignOut?: () => Promise<void> | void;
  isAuthenticated?: boolean;
  metrics?: CommandBarMetric[];
}

export default function CommandBar({
  onStartOnboarding,
  onboardingActive = false,
  onOpenNotifications,
  onOpenProfile,
  profileInitials,
  onSignOut,
  isAuthenticated = false,
  metrics = []
}: CommandBarProps) {
  const [signingOut, setSigningOut] = useState(false);

  const handleOpenNotifications = () => {
    onOpenNotifications?.();
  };

  const handleOpenProfile = () => {
    onOpenProfile?.();
  };

  const handleSignOut = async () => {
    if (!onSignOut || signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await onSignOut();
    } catch (error) {
      console.error('Failed to sign out', error);
    } finally {
      setSigningOut(false);
    }
  };

  const initials = profileInitials?.trim().slice(0, 2).toUpperCase() || 'AR';

  const displayedMetrics = metrics.slice(0, 3);

  return (
    <div
      className="sticky top-0 z-40 w-full border-b border-white/40 bg-background/95 px-4 pt-4 pb-3 backdrop-blur-sm sm:px-6 lg:pl-28 lg:pr-10"
      aria-label="Primary command bar"
    >
      <div className="mx-auto max-w-7xl">
        <div className="neo-card flex flex-col gap-4 p-4 lg:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:items-stretch">
            <div className="flex flex-1 items-center gap-3 rounded-xl bg-pearl px-4 py-2 focus-within:ring-2 focus-within:ring-electric/40">
              <Search className="h-5 w-5 text-steel" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search biomarkers, protocols, insights..."
                aria-label="Search across BioHax"
                className="flex-1 bg-transparent text-ink outline-none placeholder:text-steel"
              />
              <div className="hidden items-center gap-1 md:flex">
                <kbd className="rounded-lg border border-cloud bg-white px-2 py-1 text-xs text-steel">⌘</kbd>
                <kbd className="rounded-lg border border-cloud bg-white px-2 py-1 text-xs text-steel">K</kbd>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {displayedMetrics.length > 0
                ? displayedMetrics.map((metric) => (
                    <div
                      key={metric.id}
                      className="rounded-2xl border border-cloud/70 bg-white/80 p-3 shadow-[0_8px_20px_rgba(15,20,25,0.06)]"
                    >
                      <div className="flex items-center justify-between text-sm text-steel">
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          <metric.icon className="h-4 w-4 text-electric" />
                          {metric.label}
                        </div>
                        {typeof metric.trend === 'number' && (
                          <span className={metric.trend >= 0 ? 'text-bio' : 'text-pulse'}>
                            {metric.trend >= 0 ? '+' : ''}
                            {metric.trend.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-ink">{metric.value}</div>
                      <p className="text-xs text-steel">{metric.helper ?? 'Latest update'}</p>
                    </div>
                  ))
                : Array.from({ length: 3 }).map((_, index) => (
                    <div
                      // eslint-disable-next-line react/no-array-index-key
                      key={`metric-skeleton-${index}`}
                      className="h-20 rounded-2xl border border-cloud/50 bg-white/60 animate-pulse"
                    />
                  ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStartOnboarding}
              disabled={onboardingActive}
              aria-busy={onboardingActive}
              aria-pressed={onboardingActive}
              className={`flex-1 min-w-[200px] rounded-xl px-5 py-2.5 text-center font-bold text-void shadow-lg transition-transform sm:flex-none sm:w-auto ${
                onboardingActive ? 'gradient-electric cursor-not-allowed opacity-80' : 'gradient-electric hover:scale-105'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                {onboardingActive ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Opening…</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>Get Started</span>
                  </>
                )}
              </span>
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenNotifications}
                className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-cloud bg-white text-ink transition-colors hover:bg-pearl"
                aria-label="Open notifications"
              >
                <Bell className="h-5 w-5" />
                <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-[11px] font-bold text-white shadow-lg">
                  3
                </div>
              </button>

              <button
                type="button"
                onClick={handleOpenProfile}
                className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-transform hover:scale-105 gradient-spectrum"
                aria-label="Open profile & settings"
              >
                {initials}
              </button>

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  aria-busy={signingOut}
                  className="rounded-xl border border-cloud px-4 py-2 text-sm font-semibold text-steel transition-colors hover:border-pulse hover:text-pulse disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex items-center justify-center gap-2">
                    {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
