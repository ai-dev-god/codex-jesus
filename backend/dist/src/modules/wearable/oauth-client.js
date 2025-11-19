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
    // Try member_id first (most common)
    if (typeof payload.member_id === 'string' && payload.member_id.length > 0) {
        return payload.member_id;
    }
    if (typeof payload.member_id === 'number') {
        return String(payload.member_id);
    }
    // Try user_id
    if (typeof payload.user_id === 'string' && payload.user_id.length > 0) {
        return payload.user_id;
    }
    if (typeof payload.user_id === 'number') {
        return String(payload.user_id);
    }
    // Try user object
    const user = payload.user;
    if (user && typeof user === 'object' && !Array.isArray(user)) {
        const userObj = user;
        if (typeof userObj.id === 'string' && userObj.id.length > 0) {
            return userObj.id;
        }
        if (typeof userObj.id === 'number') {
            return String(userObj.id);
        }
        if (typeof userObj.member_id === 'string' && userObj.member_id.length > 0) {
            return userObj.member_id;
        }
        if (typeof userObj.user_id === 'string' && userObj.user_id.length > 0) {
            return userObj.user_id;
        }
    }
    // Try other common variations
    if (typeof payload.id === 'string' && payload.id.length > 0) {
        return payload.id;
    }
    if (typeof payload.id === 'number') {
        return String(payload.id);
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
        // Read response body as text first so we can use it for both error and success cases
        const responseText = await response.text().catch(() => 'Unable to read response body');
        // Log raw response for debugging
        console.log('[Whoop] Token exchange raw response:', {
            status: response.status,
            statusText: response.statusText,
            url: WHOOP_TOKEN_URL,
            contentType: response.headers.get('content-type'),
            bodyLength: responseText?.length ?? 0,
            bodyPreview: responseText?.substring(0, 500)
        });
        if (!response.ok) {
            const errorDetail = responseText ? `: ${responseText}` : '';
            console.error('[Whoop] Token exchange HTTP error:', {
                status: response.status,
                statusText: response.statusText,
                url: WHOOP_TOKEN_URL,
                errorBody: responseText?.substring(0, 500),
                headers: Object.fromEntries(response.headers.entries())
            });
            throw new WhoopOAuthError(`Whoop token exchange failed with status ${response.status}${errorDetail}`);
        }
        let payload;
        try {
            payload = JSON.parse(responseText);
        }
        catch (jsonError) {
            console.error('[Whoop] Failed to parse token exchange response as JSON:', {
                status: response.status,
                statusText: response.statusText,
                body: responseText?.substring(0, 1000),
                error: jsonError instanceof Error ? jsonError.message : String(jsonError),
                contentType: response.headers.get('content-type')
            });
            throw new WhoopOAuthError(`Whoop token exchange returned invalid JSON: ${responseText?.substring(0, 200) ?? 'empty response'}`);
        }
        // Log the full payload for debugging (but sanitize sensitive data)
        const sanitizedPayload = { ...payload };
        const sanitizeToken = (obj, key) => {
            if (typeof obj[key] === 'string') {
                obj[key] = `[REDACTED:${obj[key].length} chars]`;
            }
        };
        sanitizeToken(sanitizedPayload, 'access_token');
        sanitizeToken(sanitizedPayload, 'refresh_token');
        sanitizeToken(sanitizedPayload, 'accessToken');
        sanitizeToken(sanitizedPayload, 'refreshToken');
        sanitizeToken(sanitizedPayload, 'token');
        if (sanitizedPayload.data && typeof sanitizedPayload.data === 'object') {
            const data = sanitizedPayload.data;
            sanitizeToken(data, 'access_token');
            sanitizeToken(data, 'refresh_token');
        }
        console.log('[Whoop] Token exchange response payload:', JSON.stringify(sanitizedPayload, null, 2));
        // Handle potential nested response (e.g., { data: { access_token: ... } })
        const actualPayload = (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data))
            ? payload.data
            : payload;
        // Try multiple field name variations
        const accessToken = (typeof actualPayload.access_token === 'string' ? actualPayload.access_token : null) ||
            (typeof actualPayload.accessToken === 'string' ? actualPayload.accessToken : null) ||
            (typeof actualPayload.token === 'string' ? actualPayload.token : null) ||
            null;
        const refreshToken = (typeof actualPayload.refresh_token === 'string' ? actualPayload.refresh_token : null) ||
            (typeof actualPayload.refreshToken === 'string' ? actualPayload.refreshToken : null) ||
            null;
        const expiresInRaw = actualPayload.expires_in ?? actualPayload.expiresIn ?? actualPayload.expires;
        const expiresIn = typeof expiresInRaw === 'number'
            ? expiresInRaw
            : typeof expiresInRaw === 'string'
                ? Number.parseInt(expiresInRaw, 10)
                : NaN;
        const scope = resolveScope(actualPayload.scope);
        const whoopUserId = resolveWhoopUserId(actualPayload);
        // access_token and expires_in are required; refresh_token is optional (Whoop sometimes omits it)
        if (!accessToken || !Number.isFinite(expiresIn)) {
            // Log the FULL payload (sanitized) for debugging
            const fullSanitizedPayload = JSON.stringify(sanitizedPayload, null, 2);
            console.error('[Whoop] Token exchange payload validation failed:', {
                hasAccessToken: Boolean(accessToken),
                expiresIn: expiresInRaw,
                expiresInType: typeof expiresInRaw,
                expiresInParsed: expiresIn,
                isFinite: Number.isFinite(expiresIn),
                hasWhoopUserId: Boolean(whoopUserId),
                payloadKeys: Object.keys(payload),
                payloadTypes: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, typeof v])),
                fullPayload: fullSanitizedPayload
            });
            // Try to provide helpful error message
            const missingFields = [
                !accessToken && 'access_token',
                !Number.isFinite(expiresIn) && 'expires_in'
            ].filter(Boolean);
            throw new WhoopOAuthError(`Whoop token exchange returned an invalid payload. Missing: ${missingFields.join(', ')}. Response keys: ${Object.keys(payload).join(', ')}`);
        }
        if (!refreshToken) {
            console.warn('[Whoop] Token exchange response missing refresh_token; tokens cannot be refreshed automatically.');
        }
        // Log if user_id is missing (we'll fetch it separately)
        if (!whoopUserId) {
            console.warn('[Whoop] User ID not found in token exchange response, will be fetched separately', {
                payloadKeys: Object.keys(payload)
            });
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
