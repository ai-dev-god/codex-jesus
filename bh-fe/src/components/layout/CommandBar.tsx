import { useState } from 'react';
import { Search, Zap, Bell, Beaker, Loader2, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';

interface CommandBarProps {
  onStartOnboarding: () => void;
  onOpenLabUpload: () => void;
  onboardingActive?: boolean;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  profileInitials?: string;
  onSignOut?: () => Promise<void> | void;
  isAuthenticated?: boolean;
}

export default function CommandBar({
  onStartOnboarding,
  onOpenLabUpload,
  onboardingActive = false,
  onOpenNotifications,
  onOpenProfile,
  profileInitials,
  onSignOut,
  isAuthenticated = false
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

  return (
    <div className="sticky top-0 z-40 w-full border-b border-white/40 bg-background/95 px-4 pt-4 pb-3 backdrop-blur-sm sm:px-6" aria-label="Primary command bar">
      <div className="mx-auto max-w-7xl">
        <div className="neo-card flex flex-col gap-4 p-4 lg:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
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
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
            <button
              type="button"
              onClick={onStartOnboarding}
              disabled={onboardingActive}
              aria-busy={onboardingActive}
              aria-pressed={onboardingActive}
              className={`flex-1 basis-full rounded-xl px-5 py-2.5 text-center font-bold text-void shadow-lg transition-transform sm:flex-none sm:basis-auto sm:w-auto ${
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

            <button
              type="button"
              onClick={onOpenLabUpload}
              className="flex-1 basis-full rounded-xl border border-cloud px-4 py-2.5 text-center font-semibold text-ink transition-colors hover:border-electric hover:text-electric sm:flex-none sm:basis-auto sm:w-auto"
            >
              <span className="flex items-center justify-center gap-2">
                <Beaker className="h-4 w-4" />
                <span>Upload Labs</span>
              </span>
            </button>

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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-transform hover:scale-105 gradient-spectrum"
                  aria-label="Open profile menu"
                >
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleOpenProfile} className="flex flex-col items-start gap-1">
                  <span className="text-sm font-semibold text-ink">Profile & Settings</span>
                  <span className="text-xs text-steel">Manage account details</span>
                </DropdownMenuItem>
                {isAuthenticated && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="flex items-center gap-2 font-semibold text-steel focus:text-pulse"
                    >
                      {signingOut ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Signing out…
                        </>
                      ) : (
                        <>
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </>
                      )}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
