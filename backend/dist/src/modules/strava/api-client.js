"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stravaApiClient = exports.StravaApiClient = void 0;
const API_BASE_URL = 'https://www.strava.com/api/v3';
const parseJson = async (response, fallback) => {
    try {
        const data = (await response.json());
        return data;
    }
    catch {
        return fallback;
    }
};
const toEpochSeconds = (value) => {
    if (!value) {
        return null;
    }
    return Math.floor(value.getTime() / 1000);
};
class StravaApiClient {
    constructor(baseUrl = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }
    async listActivities(accessToken, options = {}) {
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
            throw new Error(`Strava activities request failed with status ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
        }
        const payload = await parseJson(response, []);
        if (!Array.isArray(payload)) {
            return [];
        }
        return payload;
    }
    async fetchAthleteStats(accessToken, athleteId) {
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
            throw new Error(`Strava stats request failed with status ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
        }
        return await parseJson(response, null);
    }
}
exports.StravaApiClient = StravaApiClient;
exports.stravaApiClient = new StravaApiClient();
