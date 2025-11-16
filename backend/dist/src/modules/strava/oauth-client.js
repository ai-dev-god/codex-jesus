"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stravaOAuthClient = exports.StravaOAuthClient = exports.StravaOAuthError = void 0;
const env_1 = __importDefault(require("../../config/env"));
const AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const toStringArray = (value) => {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[\s,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return [];
};
const toAthleteProfile = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value;
    const idRaw = record.id;
    const id = typeof idRaw === 'number'
        ? idRaw
        : typeof idRaw === 'string'
            ? Number.parseInt(idRaw, 10)
            : null;
    const username = typeof record.username === 'string' ? record.username : null;
    const firstname = typeof record.firstname === 'string' ? record.firstname : null;
    const lastname = typeof record.lastname === 'string' ? record.lastname : null;
    const profile = typeof record.profile === 'string' ? record.profile : null;
    const city = typeof record.city === 'string' ? record.city : null;
    const country = typeof record.country === 'string' ? record.country : null;
    return {
        id: Number.isFinite(id) ? id : null,
        username,
        firstname,
        lastname,
        profile,
        city,
        country
    };
};
class StravaOAuthError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'StravaOAuthError';
    }
}
exports.StravaOAuthError = StravaOAuthError;
class StravaOAuthClient {
    constructor(clientId = env_1.default.STRAVA_CLIENT_ID ?? null, clientSecret = env_1.default.STRAVA_CLIENT_SECRET ?? null) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }
    buildAuthorizeUrl(input) {
        if (!this.clientId) {
            throw new StravaOAuthError('Strava OAuth client is not configured', 503);
        }
        const url = new URL(AUTHORIZE_URL);
        url.searchParams.set('client_id', this.clientId);
        url.searchParams.set('redirect_uri', input.redirectUri);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', input.scope.join(','));
        url.searchParams.set('state', input.state);
        url.searchParams.set('approval_prompt', input.approvalPrompt ?? 'auto');
        return url.toString();
    }
    async exchangeCode(params) {
        return this.requestToken({
            grant_type: 'authorization_code',
            code: params.code,
            redirect_uri: params.redirectUri
        });
    }
    async refreshToken(refreshToken) {
        return this.requestToken({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
    }
    async requestToken(params) {
        if (!this.clientId || !this.clientSecret) {
            throw new StravaOAuthError('Strava OAuth client is not configured', 503);
        }
        const body = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            ...params
        });
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => null);
            throw new StravaOAuthError(`Strava token request failed with status ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`, response.status);
        }
        const payload = (await response.json());
        const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
        const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : null;
        const expiresAtRaw = payload.expires_at;
        const expiresAtSeconds = typeof expiresAtRaw === 'number'
            ? expiresAtRaw
            : typeof expiresAtRaw === 'string'
                ? Number.parseInt(expiresAtRaw, 10)
                : NaN;
        if (!accessToken || !refreshToken || !Number.isFinite(expiresAtSeconds)) {
            throw new StravaOAuthError('Strava token response missing required fields', 502);
        }
        const expiresAt = new Date(expiresAtSeconds * 1000);
        const scope = toStringArray(payload.scope);
        const athlete = toAthleteProfile(payload.athlete);
        return {
            accessToken,
            refreshToken,
            expiresAt,
            scope,
            athlete
        };
    }
}
exports.StravaOAuthClient = StravaOAuthClient;
exports.stravaOAuthClient = new StravaOAuthClient();
