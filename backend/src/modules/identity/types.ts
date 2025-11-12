import type { AuthProviderType, Role, UserStatus } from '@prisma/client';

export interface SerializedUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface AuthResponse {
  user: SerializedUser;
  tokens: AuthTokens;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  timezone: string;
  acceptedTerms: boolean;
  marketingOptIn?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface GoogleLoginInput {
  idToken: string;
  timezone?: string;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface LoginAuditContext extends RequestContext {
  email: string;
  provider: AuthProviderType;
  success: boolean;
  failureReason?: string;
  userId?: string;
}
