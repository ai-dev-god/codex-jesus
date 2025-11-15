import { ApiError } from './error';

const resolveApiBaseUrl = (): string => {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (envBaseUrl) {
    const isLocalEnv = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(envBaseUrl);
    if (!isLocalEnv) {
      return envBaseUrl;
    }

    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return envBaseUrl;
      }
    }
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'biohax.pro' || host.endsWith('.biohax.pro')) {
      return 'https://api.biohax.pro';
    }
  }

  return 'http://localhost:4000';
};

type ApiRequestInit = RequestInit & {
  authToken?: string;
};

const isJsonBody = (body: BodyInit | null | undefined): body is string | ArrayBuffer | Blob => {
  if (!body) {
    return false;
  }

  if (typeof body === 'string') {
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }

  return body instanceof Blob || body instanceof ArrayBuffer;
};

export async function apiFetch<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { authToken, headers, body, ...rest } = options;
  const requestHeaders = new Headers(headers ?? {});

  if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }

  if (body && !(body instanceof FormData) && !requestHeaders.has('Content-Type') && isJsonBody(body)) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (authToken) {
    requestHeaders.set('Authorization', `Bearer ${authToken}`);
  }

  const baseUrl = resolveApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    body,
    headers: requestHeaders
  });

  const text = await response.text();
  const parsed = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const errorPayload = parsed && typeof parsed === 'object' && 'error' in parsed ? (parsed as { error: any }).error : undefined;
    const message =
      typeof errorPayload?.message === 'string'
        ? errorPayload.message
        : text || response.statusText || 'Request failed';
    const code = typeof errorPayload?.code === 'string' ? errorPayload.code : undefined;
    throw new ApiError(message, response.status, code, parsed ?? text);
  }

  return (parsed as T) ?? (null as T);
}

const safeParseJson = (payload: string): unknown => {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
};

