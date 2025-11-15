import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { SerializedUser } from '../api/types';
import type { StoredSession } from './session';

export type AuthContextValue = {
  session: StoredSession | null;
  user: SerializedUser | null;
  isAuthenticated: boolean;
  ensureAccessToken: () => Promise<string>;
  refreshUserProfile: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ value, children }: { value: AuthContextValue; children: ReactNode }) => (
  <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

