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

export type WhoopSleepRecord = {
  id: string | number;
  user_id?: string | number;
  cycle_id?: string | number;
  created_at?: string;
  updated_at?: string;
  start?: string;
  end?: string;
  timezone_offset?: number;
  nap?: boolean;
  score_state?: string;
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_no_data_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      sleep_cycle_count?: number;
      disturbance_count?: number;
    };
    sleep_needed?: {
      baseline_milli?: number;
      need_from_sleep_debt_milli?: number;
      need_from_recent_strain_milli?: number;
      need_from_recent_nap_milli?: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
};

export type WhoopCycleRecord = {
  id: string | number;
  user_id?: string | number;
  created_at?: string;
  updated_at?: string;
  start?: string;
  end?: string;
  timezone_offset?: number;
  score_state?: string;
  score?: {
    strain?: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
};

export type WhoopRecoveryRecord = {
  id: string | number;
  cycle_id?: string | number;
  sleep_id?: string | number;
  user_id?: string | number;
  created_at?: string;
  updated_at?: string;
  score_state?: string;
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
};

export type WhoopBodyMeasurementRecord = {
  id: string | number;
  user_id?: string | number;
  height_meter?: number;
  weight_kg?: number;
  max_heart_rate?: number;
  created_at?: string;
  updated_at?: string;
  captured_at?: string;
};

export type WhoopPaginationParams = {
  start?: Date;
  end?: Date;
  limit?: number;
  cursor?: string | null;
};

export type WhoopPaginatedResponse<T> = {
  records: T[];
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
        return null;
      }

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const resolvedId = payload && typeof payload === 'object' ? payload.user_id ?? payload.id : undefined;

      if (typeof resolvedId === 'string' || typeof resolvedId === 'number') {
        return { id: resolvedId, ...payload };
      }

      return null;
    } catch {
      return null;
    }
  }

  async listWorkouts(accessToken: string, params: WhoopPaginationParams = {}): Promise<WhoopPaginatedResponse<WhoopWorkoutRecord>> {
    return this.listResource<WhoopWorkoutRecord>('/activity/workout', accessToken, params);
  }

  async listSleeps(accessToken: string, params: WhoopPaginationParams = {}): Promise<WhoopPaginatedResponse<WhoopSleepRecord>> {
    return this.listResource<WhoopSleepRecord>('/activity/sleep', accessToken, params);
  }

  async listCycles(accessToken: string, params: WhoopPaginationParams = {}): Promise<WhoopPaginatedResponse<WhoopCycleRecord>> {
    return this.listResource<WhoopCycleRecord>('/cycle', accessToken, params);
  }

  async listRecoveries(accessToken: string, params: WhoopPaginationParams = {}): Promise<WhoopPaginatedResponse<WhoopRecoveryRecord>> {
    return this.listResource<WhoopRecoveryRecord>('/recovery', accessToken, params);
  }

  async getBodyMeasurements(accessToken: string): Promise<WhoopBodyMeasurementRecord | null> {
    try {
      const url = new URL(this.buildUrl('/user/measurement/body'));
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json().catch(() => null)) as WhoopBodyMeasurementRecord | null;
    } catch {
      return null;
    }
  }

  private async listResource<T>(
    path: string,
    accessToken: string,
    params: WhoopPaginationParams
  ): Promise<WhoopPaginatedResponse<T>> {
    const url = new URL(this.buildUrl(path));
    if (params.start) {
      const iso = params.start.toISOString();
      url.searchParams.set('start', iso);
    }

    if (params.end) {
      const iso = params.end.toISOString();
      url.searchParams.set('end', iso);
    }

    if (params.limit) {
      url.searchParams.set('limit', String(Math.min(Math.max(params.limit, 1), 25)));
    }

    if (params.cursor) {
      url.searchParams.set('next_token', params.cursor);
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
        `WHOOP request to ${path} failed with status ${response.status}${text ? `: ${text.substring(0, 200)}` : ''}`,
        response.status
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const rawRecords = Array.isArray(payload.records) ? payload.records : [];
    const records = rawRecords
      .filter((entry): entry is T => entry !== null && typeof entry === 'object')
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
