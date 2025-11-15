import type { AuthResponse, AuthTokens, SerializedUser } from '../api/types';

const STORAGE_KEY = 'biohax-session';
const EXPIRY_BUFFER_MS = 5_000;

export interface SessionTokens extends AuthTokens {
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

export interface StoredSession {
  user: SerializedUser;
  tokens: SessionTokens;
}

export const normalizeTokens = (tokens: AuthTokens): SessionTokens => {
  const now = Date.now();
  return {
    ...tokens,
    accessTokenExpiresAt: now + tokens.expiresIn * 1000 - EXPIRY_BUFFER_MS,
    refreshTokenExpiresAt: now + tokens.refreshExpiresIn * 1000 - EXPIRY_BUFFER_MS
  };
};

export const persistSession = (session: StoredSession): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearPersistedSession = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
};

export const loadSession = (): StoredSession | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.tokens || typeof parsed.tokens.accessToken !== 'string') {
      return null;
    }

    if (parsed.tokens.refreshTokenExpiresAt <= Date.now()) {
      clearPersistedSession();
      return null;
    }

    return parsed;
  } catch {
    clearPersistedSession();
    return null;
  }
};

export const createSessionFromAuthResponse = (response: AuthResponse): StoredSession => ({
  user: response.user,
  tokens: normalizeTokens(response.tokens)
});

