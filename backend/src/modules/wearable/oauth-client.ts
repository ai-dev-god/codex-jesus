import env from '../../config/env';
import { whoopTokenUrl } from './whoop-config';

export interface WhoopTokenExchangeInput {
  code: string;
  redirectUri: string;
}

export interface WhoopTokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string[];
  whoopUserId: string;
}

export interface WhoopOAuthClient {
  exchangeCode(input: WhoopTokenExchangeInput): Promise<WhoopTokenExchangeResult>;
}

export class WhoopOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhoopOAuthError';
  }
}

const WHOOP_TOKEN_URL = whoopTokenUrl;

const resolveScope = (raw: unknown): string[] => {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof raw === 'string') {
    return raw
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  return [];
};

const resolveWhoopUserId = (payload: Record<string, unknown>): string | null => {
  if (typeof payload.member_id === 'string' && payload.member_id.length > 0) {
    return payload.member_id;
  }

  if (typeof payload.user_id === 'string' && payload.user_id.length > 0) {
    return payload.user_id;
  }

  const user = payload.user;
  if (user && typeof user === 'object' && !Array.isArray(user) && typeof (user as Record<string, unknown>).id === 'string') {
    return (user as Record<string, unknown>).id as string;
  }

  return null;
};

export class LiveWhoopOAuthClient implements WhoopOAuthClient {
  constructor(private readonly clientId: string | null, private readonly clientSecret: string | null) {}

  async exchangeCode(input: WhoopTokenExchangeInput): Promise<WhoopTokenExchangeResult> {
    if (!this.clientId || !this.clientSecret) {
      throw new WhoopOAuthError('Whoop OAuth credentials are not configured');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const text = await response.text().catch(() => null);
      throw new WhoopOAuthError(`Whoop token exchange failed with status ${response.status}${text ? `: ${text}` : ''}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
    const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : null;
    const expiresInRaw = payload.expires_in;
    const expiresIn =
      typeof expiresInRaw === 'number'
        ? expiresInRaw
        : typeof expiresInRaw === 'string'
          ? Number.parseInt(expiresInRaw, 10)
          : NaN;
    const scope = resolveScope(payload.scope);
    const whoopUserId = resolveWhoopUserId(payload);

    if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || !whoopUserId) {
      throw new WhoopOAuthError('Whoop token exchange returned an invalid payload');
    }

    return {
      accessToken,
      refreshToken,
      expiresIn,
      scope,
      whoopUserId
    };
  }
}

export const whoopOAuthClient: WhoopOAuthClient = new LiveWhoopOAuthClient(
  env.WHOOP_CLIENT_ID ?? null,
  env.WHOOP_CLIENT_SECRET ?? null
);
