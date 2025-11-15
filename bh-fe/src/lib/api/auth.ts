import { apiFetch } from './http';
import type { AuthResponse, AuthTokens, SerializedUser } from './types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  displayName: string;
  timezone: string;
  acceptedTerms: boolean;
  marketingOptIn?: boolean;
}

export interface GoogleLoginPayload {
  idToken: string;
  timezone?: string;
}

export interface GoogleClientConfig {
  enabled: boolean;
  clientId: string | null;
}

export const loginWithEmail = (payload: LoginPayload): Promise<AuthResponse> =>
  apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const registerWithEmail = (payload: RegisterPayload): Promise<AuthResponse> =>
  apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const loginWithGoogle = (payload: GoogleLoginPayload): Promise<AuthResponse> =>
  apiFetch<AuthResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const fetchGoogleClientConfig = (): Promise<GoogleClientConfig> =>
  apiFetch<GoogleClientConfig>('/auth/google/client');

export const refreshTokens = (refreshToken: string): Promise<AuthTokens> =>
  apiFetch<AuthTokens>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  });

export const fetchCurrentUser = (accessToken: string): Promise<SerializedUser> =>
  apiFetch<SerializedUser>('/auth/me', {
    method: 'GET',
    authToken: accessToken
  });

export const logoutUser = (accessToken: string, refreshToken?: string): Promise<void> =>
  apiFetch<void>('/auth/logout', {
    method: 'POST',
    authToken: accessToken,
    body: refreshToken ? JSON.stringify({ refreshToken }) : undefined
  });

