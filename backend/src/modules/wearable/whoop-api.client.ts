import { whoopApiBaseUrl } from './whoop-config';

export type WhoopWorkoutScore = {
  strain?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
  kilojoule?: number;
  kilocalories?: number;
  distance_meter?: number;
};

export type WhoopWorkoutRecord = {
  id: string | number;
  user_id?: string | number;
  created_at?: string;
  updated_at?: string;
  start?: string;
  end?: string;
  timezone_offset?: number;
  sport_id?: number;
  sport_type_id?: number;
  sport_name?: string;
  intensity_level?: string;
  score_state?: string;
  score?: WhoopWorkoutScore;
};

export type WhoopWorkoutListParams = {
  start?: Date;
  end?: Date;
  limit?: number;
  cursor?: string | null;
};

export type WhoopWorkoutListResponse = {
  records: WhoopWorkoutRecord[];
  nextCursor: string | null;
};

export class WhoopApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'WhoopApiError';
  }
}

const DEFAULT_BASE_URL = whoopApiBaseUrl;

export class WhoopApiClient {
  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  async getUserProfile(accessToken: string): Promise<{ id: string | number; [key: string]: unknown } | null> {
    try {
      const url = new URL(this.buildUrl('/user/profile/basic'));
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        // Try alternative endpoint
        const altUrl = new URL(this.buildUrl('/user'));
        const altResponse = await fetch(altUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        });

        if (!altResponse.ok) {
          return null;
        }

        const altPayload = (await altResponse.json().catch(() => null)) as Record<string, unknown> | null;
        const altId =
          altPayload && typeof altPayload === 'object'
            ? (altPayload.id ??
              altPayload.user_id ??
              altPayload.member_id ??
              (typeof altPayload.user === 'object' && altPayload.user
                ? (altPayload.user as Record<string, unknown>).id ?? (altPayload.user as Record<string, unknown>).user_id
                : undefined))
            : undefined;
        if (typeof altId === 'string' || typeof altId === 'number') {
          return { id: altId, ...altPayload };
        }
        return null;
      }

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const resolvedId =
        payload && typeof payload === 'object'
          ? (payload.id ??
            payload.user_id ??
            (typeof payload.user === 'object' && payload.user
              ? ((payload.user as Record<string, unknown>).id ??
                (payload.user as Record<string, unknown>).user_id ??
                (payload.user as Record<string, unknown>).member_id)
              : undefined) ??
            payload.member_id)
          : undefined;
      if (typeof resolvedId === 'string' || typeof resolvedId === 'number') {
        return { id: resolvedId, ...payload };
      }
      return null;
    } catch {
      return null;
    }
  }

  async listWorkouts(accessToken: string, params: WhoopWorkoutListParams = {}): Promise<WhoopWorkoutListResponse> {
    const url = new URL(this.buildUrl('/workouts'));
    if (params.start) {
      const iso = params.start.toISOString();
      url.searchParams.set('start', iso);
      url.searchParams.set('start_time', iso);
    }

    if (params.end) {
      const iso = params.end.toISOString();
      url.searchParams.set('end', iso);
      url.searchParams.set('end_time', iso);
    }

    if (params.limit) {
      url.searchParams.set('limit', String(Math.min(Math.max(params.limit, 1), 200)));
    }

    if (params.cursor) {
      url.searchParams.set('next_token', params.cursor);
      url.searchParams.set('cursor', params.cursor);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => null);
      throw new WhoopApiError(
        `WHOOP workouts request failed with status ${response.status}${text ? `: ${text.substring(0, 200)}` : ''}`,
        response.status
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const rawRecords = Array.isArray(payload.records) ? payload.records : [];
    const records = rawRecords
      .filter((entry): entry is WhoopWorkoutRecord => entry !== null && typeof entry === 'object')
      .map((entry) => entry);
    const nextCursor =
      typeof payload.next_token === 'string'
        ? payload.next_token
        : typeof (payload as { nextToken?: unknown }).nextToken === 'string'
          ? ((payload as { nextToken?: string }).nextToken as string)
          : null;

    return {
      records,
      nextCursor
    };
  }

  private buildUrl(path: string): string {
    const normalizedBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }
}

