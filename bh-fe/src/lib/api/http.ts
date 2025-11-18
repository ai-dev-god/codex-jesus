import { ApiError } from './error';

const CLOUD_RUN_API_URL = 'https://bh-backend-final-714223448245.europe-west1.run.app';

const resolveApiBaseUrl = (): string => {
  // Runtime override: always use Cloud Run URL on production domain to avoid CORS issues
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'biohax.pro' || host.endsWith('.biohax.pro')) {
      return CLOUD_RUN_API_URL;
    }
    if (host.endsWith('.run.app') || host.endsWith('.a.run.app')) {
      return CLOUD_RUN_API_URL;
    }
  }

  const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (envBaseUrl) {
    const isLocalEnv = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(envBaseUrl);
    if (!isLocalEnv) {
      return envBaseUrl;
    }

    if (typeof window === 'undefined') {
      return envBaseUrl;
    }

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return envBaseUrl;
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

const buildRequest = async (
  path: string,
  options: ApiRequestInit
): Promise<Response> => {
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
  const fullUrl = `${baseUrl}${path}`;
  
  return fetch(fullUrl, {
    ...rest,
    body,
    headers: requestHeaders
  });
};

const throwResponseError = (response: Response, bodyText: string | null, parsedBody: unknown): never => {
  const errorPayload =
    parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody
      ? ((parsedBody as { error?: { message?: string; code?: string } }).error ?? undefined)
      : undefined;
  const message =
    typeof errorPayload?.message === 'string'
      ? errorPayload.message
      : bodyText || response.statusText || 'Request failed';
  const code = typeof errorPayload?.code === 'string' ? errorPayload.code : undefined;
  throw new ApiError(message, response.status, code, parsedBody ?? bodyText ?? undefined);
};

export async function apiFetch<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const response = await buildRequest(path, options);
  const text = await response.text();
  const parsed = text ? safeParseJson(text) : null;

  if (!response.ok) {
    throwResponseError(response, text, parsed);
  }

  return (parsed as T) ?? (null as T);
}

export async function apiFetchBlob(path: string, options: ApiRequestInit = {}): Promise<Blob> {
  const response = await buildRequest(path, options);
  if (!response.ok) {
    const text = await response.text();
    const parsed = text ? safeParseJson(text) : null;
    throwResponseError(response, text, parsed);
  }
  return await response.blob();
}

const safeParseJson = (payload: string): unknown => {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
};

