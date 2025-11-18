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
  whoopUserId: string | null; // May be null if not in token response, will be fetched separately
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
  // Try member_id first (most common)
  if (typeof payload.member_id === 'string' && payload.member_id.length > 0) {
    return payload.member_id;
  }
  if (typeof payload.member_id === 'number') {
    return String(payload.member_id);
  }

  // Try user_id
  if (typeof payload.user_id === 'string' && payload.user_id.length > 0) {
    return payload.user_id;
  }
  if (typeof payload.user_id === 'number') {
    return String(payload.user_id);
  }

  // Try user object
  const user = payload.user;
  if (user && typeof user === 'object' && !Array.isArray(user)) {
    const userObj = user as Record<string, unknown>;
    if (typeof userObj.id === 'string' && userObj.id.length > 0) {
      return userObj.id;
    }
    if (typeof userObj.id === 'number') {
      return String(userObj.id);
    }
    if (typeof userObj.member_id === 'string' && userObj.member_id.length > 0) {
      return userObj.member_id;
    }
    if (typeof userObj.user_id === 'string' && userObj.user_id.length > 0) {
      return userObj.user_id;
    }
  }

  // Try other common variations
  if (typeof payload.id === 'string' && payload.id.length > 0) {
    return payload.id;
  }
  if (typeof payload.id === 'number') {
    return String(payload.id);
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

    // Read response body as text first so we can use it for both error and success cases
    const responseText = await response.text().catch(() => 'Unable to read response body');

    if (!response.ok) {
      const errorDetail = responseText ? `: ${responseText}` : '';
      console.error('[Whoop] Token exchange HTTP error:', {
        status: response.status,
        statusText: response.statusText,
        url: WHOOP_TOKEN_URL,
        errorBody: responseText?.substring(0, 500)
      });
      throw new WhoopOAuthError(`Whoop token exchange failed with status ${response.status}${errorDetail}`);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(responseText) as Record<string, unknown>;
    } catch (jsonError) {
      console.error('[Whoop] Failed to parse token exchange response as JSON:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText?.substring(0, 1000),
        error: jsonError instanceof Error ? jsonError.message : String(jsonError)
      });
      throw new WhoopOAuthError(`Whoop token exchange returned invalid JSON: ${responseText?.substring(0, 200) ?? 'empty response'}`);
    }

    // Log the full payload for debugging (but sanitize sensitive data)
    const sanitizedPayload = { ...payload };
    if (typeof sanitizedPayload.access_token === 'string') {
      sanitizedPayload.access_token = `[REDACTED:${sanitizedPayload.access_token.length} chars]`;
    }
    if (typeof sanitizedPayload.refresh_token === 'string') {
      sanitizedPayload.refresh_token = `[REDACTED:${sanitizedPayload.refresh_token.length} chars]`;
    }
    console.log('[Whoop] Token exchange response payload:', JSON.stringify(sanitizedPayload, null, 2));

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

    // access_token, refresh_token, and expires_in are required
    if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) {
      console.error('[Whoop] Token exchange payload validation failed:', {
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
        expiresIn: expiresInRaw,
        expiresInParsed: expiresIn,
        isFinite: Number.isFinite(expiresIn),
        hasWhoopUserId: Boolean(whoopUserId),
        payloadKeys: Object.keys(payload),
        fullPayload: JSON.stringify(sanitizedPayload, null, 2)
      });
      throw new WhoopOAuthError(
        `Whoop token exchange returned an invalid payload. Missing: ${[
          !accessToken && 'access_token',
          !refreshToken && 'refresh_token',
          !Number.isFinite(expiresIn) && 'expires_in'
        ]
          .filter(Boolean)
          .join(', ')}`
      );
    }

    // Log if user_id is missing (we'll fetch it separately)
    if (!whoopUserId) {
      console.warn('[Whoop] User ID not found in token exchange response, will be fetched separately', {
        payloadKeys: Object.keys(payload)
      });
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
