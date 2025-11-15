import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../lib/auth/AuthContext';
import { fetchProfile, type Profile } from '../lib/api/profile';
import { ApiError } from '../lib/api/error';

export function useProfile(options: { auto?: boolean } = {}) {
  const { auto = true } = options;
  const { ensureAccessToken } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(auto);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const data = await fetchProfile(token);
      setProfile(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    if (auto) {
      void refresh();
    }
  }, [auto, refresh]);

  return { profile, loading, error, refresh, setProfile };
}

