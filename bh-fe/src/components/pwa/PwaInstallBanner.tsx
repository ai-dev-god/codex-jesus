import { useState } from 'react';
import { Download, Info, X } from 'lucide-react';
import { Button } from '../ui/button';
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt';

export function PwaInstallBanner() {
  const { canInstall, promptInstall, platform, isStandalone, dismissed, markDismissed } = usePwaInstallPrompt();
  const [status, setStatus] = useState<'idle' | 'prompted' | 'installed'>('idle');

  if (isStandalone || dismissed || (!canInstall && platform !== 'ios')) {
    return null;
  }

  const handleInstall = async () => {
    const result = await promptInstall();
    if (result.outcome === 'accepted') {
      setStatus('installed');
    } else {
      setStatus('prompted');
    }
  };

  return (
    <div className="relative mt-6 rounded-2xl border border-cloud bg-white/70 p-4 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
      <button
        type="button"
        onClick={markDismissed}
        aria-label="Dismiss PWA install banner"
        className="absolute right-4 top-4 rounded-full p-1 text-steel hover:bg-cloud"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-3 pr-8 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Install BioHax</p>
            <p className="text-xs text-steel">Get faster access, offline insights, and richer notifications.</p>
          </div>
        </div>

        {platform === 'ios' ? (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-electric/30 bg-electric/5 p-3 text-sm text-steel">
            <div className="flex items-center gap-2 font-medium text-ink">
              <Info className="h-4 w-4" />
              Add to Home Screen on iOS
            </div>
            <ol className="ml-5 list-decimal space-y-1">
              <li>Tap the share icon in Safari.</li>
              <li>Select <strong>Add to Home Screen</strong>.</li>
              <li>Confirm to pin the BioHax PWA.</li>
            </ol>
            <Button size="sm" variant="outline" className="self-start" onClick={markDismissed}>
              Got it
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-steel">
              Install the BioHax PWA for a native app experience on your device.
            </p>
            <Button size="sm" onClick={handleInstall} disabled={!canInstall}>
              <Download className="mr-2 h-4 w-4" />
              {status === 'installed' ? 'Installed' : 'Install app'}
            </Button>
          </div>
        )}

        {status === 'prompted' && (
          <p className="text-xs text-solar">If you dismissed the browser prompt, you can install later from browser settings.</p>
        )}
      </div>
    </div>
  );
}

