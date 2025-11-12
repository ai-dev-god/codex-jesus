import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { AuthProviderType, Role, UserStatus } from '@prisma/client';

import env from '../../config/env';

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_SALT = 'biohax-refresh';

type AccessTokenClaims = JwtPayload & {
  sub: string;
  email: string;
  role: Role;
  status: UserStatus;
  type: typeof ACCESS_TOKEN_TYPE;
};

type RefreshTokenClaims = JwtPayload & {
  sub: string;
  provider: AuthProviderType;
  type: typeof REFRESH_TOKEN_TYPE;
};

export interface AccessTokenPayload {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
}

export interface RefreshTokenPayload {
  userId: string;
  provider: AuthProviderType;
}

export class TokenService {
  private readonly jwtSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;
  private readonly refreshKey: Buffer;

  constructor() {
    this.jwtSecret = env.AUTH_JWT_SECRET;
    this.accessTtlSeconds = env.AUTH_ACCESS_TOKEN_TTL_SECONDS;
    this.refreshTtlSeconds = env.AUTH_REFRESH_TOKEN_TTL_SECONDS;
    this.refreshKey = scryptSync(env.AUTH_REFRESH_ENCRYPTION_KEY, ENCRYPTION_SALT, 32);
  }

  issueAccessToken(payload: AccessTokenPayload): { token: string; expiresIn: number } {
    const token = jwt.sign(
      {
        sub: payload.id,
        email: payload.email,
        role: payload.role,
        status: payload.status,
        type: ACCESS_TOKEN_TYPE
      },
      this.jwtSecret,
      { expiresIn: this.accessTtlSeconds }
    );

    return {
      token,
      expiresIn: this.accessTtlSeconds
    };
  }

  issueRefreshToken(payload: RefreshTokenPayload): { token: string; expiresIn: number } {
    const token = jwt.sign(
      {
        sub: payload.userId,
        provider: payload.provider,
        type: REFRESH_TOKEN_TYPE
      },
      this.jwtSecret,
      { expiresIn: this.refreshTtlSeconds }
    );

    return {
      token,
      expiresIn: this.refreshTtlSeconds
    };
  }

  decodeAccessToken(token: string): AccessTokenClaims | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as AccessTokenClaims;
      if (decoded.type !== ACCESS_TOKEN_TYPE) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token: string): RefreshTokenClaims {
    const decoded = jwt.verify(token, this.jwtSecret) as RefreshTokenClaims;
    if (decoded.type !== REFRESH_TOKEN_TYPE) {
      throw new Error('Invalid refresh token');
    }
    return decoded;
  }

  encryptRefreshToken(token: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, this.refreshKey, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
  }

  decryptRefreshToken(encoded: string): string | null {
    const segments = encoded.split('.');
    if (segments.length !== 3) {
      return null;
    }

    const [ivEncoded, dataEncoded, authTagEncoded] = segments;
    try {
      const iv = Buffer.from(ivEncoded, 'base64url');
      const authTag = Buffer.from(authTagEncoded, 'base64url');
      const encryptedData = Buffer.from(dataEncoded, 'base64url');

      const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, this.refreshKey, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  getAccessTokenTtl(): number {
    return this.accessTtlSeconds;
  }

  getRefreshTokenTtl(): number {
    return this.refreshTtlSeconds;
  }
}

export const tokenService = new TokenService();
