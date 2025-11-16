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

const DEFAULT_BASE_URL = 'https://api.prod.whoop.com/developer/v1';

export class WhoopApiClient {
  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

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

