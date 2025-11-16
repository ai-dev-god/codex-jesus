import { useCallback, useEffect, useMemo, useState } from 'react';

type InstallPlatform = 'ios' | 'android' | 'desktop';

export function usePwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);

    const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
    setIsStandalone(mediaStandalone || !!iosStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
    };
  }, []);

  const platform: InstallPlatform = useMemo(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      return 'ios';
    }
    if (/android/.test(userAgent)) {
      return 'android';
    }
    return 'desktop';
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return { outcome: 'dismissed' as const };
    }

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === 'dismissed') {
      setDismissed(true);
    }
    return choice;
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt,
    promptInstall,
    platform,
    isStandalone,
    dismissed,
    markDismissed: () => setDismissed(true),
  };
}

