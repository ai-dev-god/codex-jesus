const API_BASE_URL = 'https://www.strava.com/api/v3';

export type StravaActivityPayload = {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_watts?: number;
  max_watts?: number;
  suffer_score?: number;
  achievement_count?: number;
  kudos_count?: number;
  start_date: string;
  start_date_local?: string;
  commute?: boolean;
  trainer?: boolean;
  kilojoules?: number;
};

export type StravaAthleteStats = Record<string, unknown>;

type ListActivityOptions = {
  perPage?: number;
  after?: Date;
  page?: number;
};

const parseJson = async <T>(response: Response, fallback: T): Promise<T> => {
  try {
    const data = (await response.json()) as T;
    return data;
  } catch {
    return fallback;
  }
};

const toEpochSeconds = (value: Date | undefined): number | null => {
  if (!value) {
    return null;
  }
  return Math.floor(value.getTime() / 1000);
};

export class StravaApiClient {
  constructor(private readonly baseUrl: string = API_BASE_URL) {}

  async listActivities(accessToken: string, options: ListActivityOptions = {}): Promise<StravaActivityPayload[]> {
    const perPage = options.perPage ?? 50;
    const page = options.page ?? 1;
    const url = new URL(`${this.baseUrl}/athlete/activities`);
    url.searchParams.set('per_page', `${perPage}`);
    url.searchParams.set('page', `${page}`);

    const after = toEpochSeconds(options.after);
    if (after) {
      url.searchParams.set('after', `${after}`);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => null);
      throw new Error(
        `Strava activities request failed with status ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`
      );
    }

    const payload = await parseJson(response, []);
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload as StravaActivityPayload[];
  }

  async fetchAthleteStats(accessToken: string, athleteId: number): Promise<StravaAthleteStats | null> {
    if (!Number.isFinite(athleteId)) {
      return null;
    }

    const url = new URL(`${this.baseUrl}/athletes/${athleteId}/stats`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => null);
      throw new Error(
        `Strava stats request failed with status ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`
      );
    }

    return await parseJson(response, null);
  }
}

export const stravaApiClient = new StravaApiClient();

