import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightFromLine,
  Bell,
  Loader2,
  Search,
  Sparkles,
  UserRound,
  WifiOff
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '../ui/command';

export interface CommandActionDescriptor {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  shortcut?: string;
  badge?: string;
  disabled?: boolean;
  onSelect: () => Promise<void> | void;
}

export interface CommandGroupDescriptor {
  id: string;
  title: string;
  commands: CommandActionDescriptor[];
}

interface CommandBarProps {
  onOpenNotifications?: () => Promise<void> | void;
  onOpenProfile?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
  profileInitials?: string;
  isAuthenticated?: boolean;
  isIndexing?: boolean;
  notificationCount?: number;
  commandGroups?: CommandGroupDescriptor[];
  lastIndexedAt?: string | null;
  isOnline?: boolean;
}

const formatRelativeTime = (isoTimestamp?: string | null) => {
  if (!isoTimestamp) {
    return null;
  }
  const timestamp = Date.parse(isoTimestamp);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  const diffMs = Date.now() - timestamp;
  const absDiff = Math.abs(diffMs);
  if (absDiff < 60_000) {
    return 'just now';
  }
  const minutes = Math.round(absDiff / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

export default function CommandBar({
  onOpenNotifications,
  onOpenProfile,
  profileInitials,
  onSignOut,
  isAuthenticated = false,
  isIndexing = false,
  notificationCount = 0,
  commandGroups = [],
  lastIndexedAt,
  isOnline
}: CommandBarProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [executingCommandId, setExecutingCommandId] = useState<string | null>(null);

  const handleOpenNotifications = () => {
    if (!onOpenNotifications || signingOut) {
      return;
    }
    void onOpenNotifications();
  };

  const handleOpenProfile = () => {
    if (!onOpenProfile || signingOut) {
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((previous) => !previous);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) {
      setSearchValue('');
      setExecutingCommandId(null);
    }
  }, [paletteOpen]);

  const handleCommandSelect = async (command: CommandActionDescriptor) => {
    if (command.disabled) {
      return;
    }
    setExecutingCommandId(command.id);
    try {
      await Promise.resolve(command.onSelect());
      setPaletteOpen(false);
    } catch (error) {
      console.error('Failed to execute command', error);
    } finally {
      setExecutingCommandId(null);
    }
  };

  const profileLabel = profileInitials ? `Open profile for ${profileInitials}` : 'Open profile & settings';

  const displayCount = notificationCount > 99 ? '99+' : notificationCount.toString();

  const availableGroups = useMemo(
    () => (commandGroups ?? []).filter((group) => group.commands.length > 0),
    [commandGroups]
  );

  const relativeSync = formatRelativeTime(lastIndexedAt);
  const statusLabel = isIndexing ? 'Syncing latest BioHax data…' : relativeSync ? `Synced ${relativeSync}` : 'Awaiting first sync';
  const offline = isOnline === false;

  const shortcutBadge = (
    <div className="hidden items-center gap-1 text-[11px] font-semibold text-steel sm:flex" aria-hidden="true">
      <kbd className="rounded border border-cloud bg-white px-1.5 py-0.5 text-[10px] font-semibold text-steel">⌘</kbd>
      <span>+</span>
      <kbd className="rounded border border-cloud bg-white px-1.5 py-0.5 text-[10px] font-semibold text-steel">K</kbd>
    </div>
  );

  return (
    <>
      <div
        className="command-bar sticky top-0 z-40 w-full border-b border-white/30 bg-background/90 px-4 py-3 backdrop-blur-sm sm:px-6 lg:pl-28 lg:pr-10"
        aria-label="Primary command bar actions"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 rounded-2xl border border-cloud/60 bg-white/85 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.07)] backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-cloud/70 bg-white px-4 py-3 text-left text-sm font-semibold text-steel transition hover:border-electric hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
              >
                <div className="flex items-center gap-3">
                  <Search className="h-4 w-4 text-steel" aria-hidden="true" />
                  <span className="text-ink">Search data, plans, or actions…</span>
                </div>
                {shortcutBadge}
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {offline && (
                  <span className="flex items-center gap-1 rounded-full border border-pulse/40 bg-pulse/10 px-3 py-1 text-xs font-semibold text-pulse">
                    <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                    Offline
                  </span>
                )}

                <span className="flex items-center gap-2 rounded-full border border-cloud/70 bg-white px-3 py-1 text-xs font-semibold text-steel">
                  {isIndexing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-electric" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-electric" aria-hidden="true" />
                  )}
                  <span aria-live="polite">{statusLabel}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleOpenNotifications}
                disabled={isIndexing || signingOut}
                aria-label="Open notifications"
                className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-cloud/80 bg-white text-ink transition-colors hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
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
                <UserRound className="h-5 w-5" aria-hidden="true" />
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
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowRightFromLine className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title="BioHax Command Center"
        description="Jump anywhere, log data, or run AI-powered actions"
      >
        <CommandInput
          placeholder="Search by action, biomarker, or plan…"
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <CommandList>
          <CommandEmpty>No matching commands. Try a different keyword.</CommandEmpty>
          {availableGroups.map((group, index) => (
            <div key={group.id}>
              <CommandGroup heading={group.title}>
                {group.commands.map((command) => {
                  const Icon = command.icon;
                  const disabled = Boolean(
                    command.disabled || (executingCommandId && executingCommandId !== command.id)
                  );
                  return (
                    <CommandItem
                      key={command.id}
                      value={`${command.label} ${command.description ?? ''}`}
                      onSelect={() => handleCommandSelect(command)}
                      disabled={disabled}
                    >
                      {Icon && <Icon className="h-4 w-4 text-steel" aria-hidden="true" />}
                      <div className="flex flex-1 flex-col text-left">
                        <span className="font-semibold text-ink">{command.label}</span>
                        {command.description && (
                          <span className="text-xs text-steel">{command.description}</span>
                        )}
                      </div>
                      {command.badge && (
                        <span className="rounded-full border border-cloud/80 bg-white px-2 py-0.5 text-[11px] font-semibold text-steel">
                          {command.badge}
                        </span>
                      )}
                      {command.shortcut && (
                        <CommandShortcut>{command.shortcut}</CommandShortcut>
                      )}
                      {executingCommandId === command.id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-electric" aria-hidden="true" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {index < availableGroups.length - 1 && <CommandSeparator />}
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
