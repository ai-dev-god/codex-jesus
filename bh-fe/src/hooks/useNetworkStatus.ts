import { useEffect, useState } from 'react';

const getNavigatorStatus = () => {
  if (typeof navigator === 'undefined') {
    return true;
  }
  return navigator.onLine;
};

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(getNavigatorStatus);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const updateStatus = () => setIsOnline(getNavigatorStatus());

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  return isOnline;
}

