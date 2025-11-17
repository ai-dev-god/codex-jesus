"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whoopDefaults = exports.whoopApiBaseUrl = exports.whoopTokenUrl = exports.whoopAuthorizeUrl = exports.normalizeAuthorizeUrl = void 0;
const env_1 = __importDefault(require("../../config/env"));
const DEFAULT_AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const DEFAULT_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const DEFAULT_API_BASE_URL = 'https://api.prod.whoop.com/developer/v1';
const sanitizeUrl = (rawUrl, fallback) => {
    if (!rawUrl) {
        return fallback;
    }
    try {
        return new URL(rawUrl).toString();
    }
    catch {
        return fallback;
    }
};
const normalizeAuthorizeUrl = (rawUrl) => {
    const fallback = DEFAULT_AUTHORIZE_URL;
    if (!rawUrl) {
        return fallback;
    }
    try {
        const url = new URL(rawUrl);
        if (/\/oauth\/oauth2\/authorize\/?$/i.test(url.pathname)) {
            url.pathname = url.pathname.replace(/\/authorize\/?$/i, '/auth');
        }
        else if (!/\/oauth\/oauth2\/auth\/?$/i.test(url.pathname)) {
            url.pathname = '/oauth/oauth2/auth';
        }
        return url.toString();
    }
    catch {
        return fallback;
    }
};
exports.normalizeAuthorizeUrl = normalizeAuthorizeUrl;
exports.whoopAuthorizeUrl = (0, exports.normalizeAuthorizeUrl)(env_1.default.WHOOP_AUTHORIZE_URL);
exports.whoopTokenUrl = sanitizeUrl(env_1.default.WHOOP_TOKEN_URL, DEFAULT_TOKEN_URL);
exports.whoopApiBaseUrl = sanitizeUrl(env_1.default.WHOOP_API_BASE_URL, DEFAULT_API_BASE_URL);
exports.whoopDefaults = {
    authorizeUrl: DEFAULT_AUTHORIZE_URL,
    tokenUrl: DEFAULT_TOKEN_URL,
    apiBaseUrl: DEFAULT_API_BASE_URL
};
