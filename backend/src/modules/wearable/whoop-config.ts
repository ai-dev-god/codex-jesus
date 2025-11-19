import env from '../../config/env';

const DEFAULT_AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const DEFAULT_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const DEFAULT_API_BASE_URL = 'https://api.prod.whoop.com/developer/v2';

const sanitizeUrl = (rawUrl: string | null | undefined, fallback: string): string => {
  if (!rawUrl) {
    return fallback;
  }

  try {
    return new URL(rawUrl).toString();
  } catch {
    return fallback;
  }
};

export const normalizeAuthorizeUrl = (rawUrl: string | null | undefined): string => {
  const fallback = DEFAULT_AUTHORIZE_URL;
  if (!rawUrl) {
    return fallback;
  }

  try {
    const url = new URL(rawUrl);
    if (/\/oauth\/oauth2\/authorize\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/authorize\/?$/i, '/auth');
    } else if (!/\/oauth\/oauth2\/auth\/?$/i.test(url.pathname)) {
      url.pathname = '/oauth/oauth2/auth';
    }
    return url.toString();
  } catch {
    return fallback;
  }
};

export const whoopAuthorizeUrl = normalizeAuthorizeUrl(env.WHOOP_AUTHORIZE_URL);
export const whoopTokenUrl = sanitizeUrl(env.WHOOP_TOKEN_URL, DEFAULT_TOKEN_URL);
export const whoopApiBaseUrl = sanitizeUrl(env.WHOOP_API_BASE_URL, DEFAULT_API_BASE_URL);

export const whoopDefaults = {
  authorizeUrl: DEFAULT_AUTHORIZE_URL,
  tokenUrl: DEFAULT_TOKEN_URL,
  apiBaseUrl: DEFAULT_API_BASE_URL
} as const;


