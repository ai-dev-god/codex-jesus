"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhoopApiClient = exports.WhoopApiError = void 0;
const whoop_config_1 = require("./whoop-config");
class WhoopApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'WhoopApiError';
    }
}
exports.WhoopApiError = WhoopApiError;
const DEFAULT_BASE_URL = whoop_config_1.whoopApiBaseUrl;
class WhoopApiClient {
    constructor(baseUrl = DEFAULT_BASE_URL) {
        this.baseUrl = baseUrl;
    }
    async listWorkouts(accessToken, params = {}) {
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
            throw new WhoopApiError(`WHOOP workouts request failed with status ${response.status}${text ? `: ${text.substring(0, 200)}` : ''}`, response.status);
        }
        const payload = (await response.json().catch(() => ({})));
        const rawRecords = Array.isArray(payload.records) ? payload.records : [];
        const records = rawRecords
            .filter((entry) => entry !== null && typeof entry === 'object')
            .map((entry) => entry);
        const nextCursor = typeof payload.next_token === 'string'
            ? payload.next_token
            : typeof payload.nextToken === 'string'
                ? payload.nextToken
                : null;
        return {
            records,
            nextCursor
        };
    }
    buildUrl(path) {
        const normalizedBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return `${normalizedBase}${normalizedPath}`;
    }
}
exports.WhoopApiClient = WhoopApiClient;
