import { useState } from 'react';
import { ArrowRightFromLine, Bell, Loader2, UserRound } from 'lucide-react';

interface CommandBarProps {
  onOpenNotifications?: () => Promise<void> | void;
  onOpenProfile?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
  profileInitials?: string;
  isAuthenticated?: boolean;
  isIndexing?: boolean;
  notificationCount?: number;
}

export default function CommandBar({
  onOpenNotifications,
  onOpenProfile,
  profileInitials,
  onSignOut,
  isAuthenticated = false,
  isIndexing = false,
  notificationCount = 0
}: CommandBarProps) {
  const [signingOut, setSigningOut] = useState(false);

  const handleOpenNotifications = () => {
    if (!onOpenNotifications) {
      return;
    }
    void onOpenNotifications();
  };

  const handleOpenProfile = () => {
    if (!onOpenProfile) {
      return;
    }
    void onOpenProfile();
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

  const profileLabel = profileInitials
    ? `Open profile for ${profileInitials}`
    : 'Open profile & settings';

  const displayCount =
    notificationCount > 99 ? '99+' : notificationCount.toString();

  return (
    <div
      className="sticky top-0 z-40 w-full border-b border-white/30 bg-background/90 px-4 py-3 backdrop-blur-sm sm:px-6 lg:pl-28 lg:pr-10"
      aria-label="Primary command bar actions"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-end gap-2 rounded-2xl border border-cloud/60 bg-white/80 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.07)]">
          {isIndexing && (
            <div
              className="mr-auto flex items-center gap-2 rounded-xl border border-electric/30 bg-electric/10 px-3 py-1 text-xs font-semibold text-electric"
              aria-live="polite"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Indexing latest data…</span>
            </div>
          )}

              <button
                type="button"
                onClick={handleOpenNotifications}
            disabled={isIndexing || signingOut}
                aria-label="Open notifications"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-cloud/80 bg-white text-ink transition-colors hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pulse px-1 text-[11px] font-semibold text-white">
                {displayCount}
              </span>
            )}
              </button>

              <button
                type="button"
                onClick={handleOpenProfile}
            disabled={isIndexing || signingOut}
            aria-label={profileLabel}
            title={profileLabel}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-cloud/80 bg-white text-ink transition-colors hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-50"
              >
            <UserRound className="h-5 w-5" />
              </button>

              {isAuthenticated && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  aria-busy={signingOut}
              aria-label="Sign out"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-cloud/80 bg-white text-ink transition-colors hover:border-pulse hover:text-pulse disabled:cursor-not-allowed disabled:opacity-60"
                >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightFromLine className="h-4 w-4" />
              )}
                </button>
              )}
        </div>
      </div>
    </div>
  );
}
