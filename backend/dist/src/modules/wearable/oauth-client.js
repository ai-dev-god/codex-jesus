"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoopOAuthClient = exports.LiveWhoopOAuthClient = exports.WhoopOAuthError = void 0;
const env_1 = __importDefault(require("../../config/env"));
const whoop_config_1 = require("./whoop-config");
class WhoopOAuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WhoopOAuthError';
    }
}
exports.WhoopOAuthError = WhoopOAuthError;
const WHOOP_TOKEN_URL = whoop_config_1.whoopTokenUrl;
const resolveScope = (raw) => {
    if (!raw) {
        return [];
    }
    if (Array.isArray(raw)) {
        return raw.filter((entry) => typeof entry === 'string');
    }
    if (typeof raw === 'string') {
        return raw
            .split(/[,\s]+/)
            .map((scope) => scope.trim())
            .filter(Boolean);
    }
    return [];
};
const resolveWhoopUserId = (payload) => {
    if (typeof payload.member_id === 'string' && payload.member_id.length > 0) {
        return payload.member_id;
    }
    if (typeof payload.user_id === 'string' && payload.user_id.length > 0) {
        return payload.user_id;
    }
    const user = payload.user;
    if (user && typeof user === 'object' && !Array.isArray(user) && typeof user.id === 'string') {
        return user.id;
    }
    return null;
};
class LiveWhoopOAuthClient {
    constructor(clientId, clientSecret) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }
    async exchangeCode(input) {
        if (!this.clientId || !this.clientSecret) {
            throw new WhoopOAuthError('Whoop OAuth credentials are not configured');
        }
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: input.code,
            redirect_uri: input.redirectUri,
            client_id: this.clientId,
            client_secret: this.clientSecret
        });
        const response = await fetch(WHOOP_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });
        if (!response.ok) {
            const text = await response.text().catch(() => null);
            const errorDetail = text ? `: ${text}` : '';
            console.error('[Whoop] Token exchange HTTP error:', {
                status: response.status,
                statusText: response.statusText,
                url: WHOOP_TOKEN_URL,
                errorBody: text?.substring(0, 500)
            });
            throw new WhoopOAuthError(`Whoop token exchange failed with status ${response.status}${errorDetail}`);
        }
        const payload = (await response.json());
        const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
        const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : null;
        const expiresInRaw = payload.expires_in;
        const expiresIn = typeof expiresInRaw === 'number'
            ? expiresInRaw
            : typeof expiresInRaw === 'string'
                ? Number.parseInt(expiresInRaw, 10)
                : NaN;
        const scope = resolveScope(payload.scope);
        const whoopUserId = resolveWhoopUserId(payload);
        if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || !whoopUserId) {
            throw new WhoopOAuthError('Whoop token exchange returned an invalid payload');
        }
        return {
            accessToken,
            refreshToken,
            expiresIn,
            scope,
            whoopUserId
        };
    }
}
exports.LiveWhoopOAuthClient = LiveWhoopOAuthClient;
exports.whoopOAuthClient = new LiveWhoopOAuthClient(env_1.default.WHOOP_CLIENT_ID ?? null, env_1.default.WHOOP_CLIENT_SECRET ?? null);
