"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenService = exports.TokenService = void 0;
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = __importDefault(require("../../config/env"));
const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_SALT = 'biohax-refresh';
class TokenService {
    constructor() {
        this.jwtSecret = env_1.default.AUTH_JWT_SECRET;
        this.accessTtlSeconds = env_1.default.AUTH_ACCESS_TOKEN_TTL_SECONDS;
        this.refreshTtlSeconds = env_1.default.AUTH_REFRESH_TOKEN_TTL_SECONDS;
        this.refreshKey = (0, crypto_1.scryptSync)(env_1.default.AUTH_REFRESH_ENCRYPTION_KEY, ENCRYPTION_SALT, 32);
    }
    issueAccessToken(payload) {
        const token = jsonwebtoken_1.default.sign({
            sub: payload.id,
            email: payload.email,
            role: payload.role,
            status: payload.status,
            type: ACCESS_TOKEN_TYPE
        }, this.jwtSecret, { expiresIn: this.accessTtlSeconds });
        return {
            token,
            expiresIn: this.accessTtlSeconds
        };
    }
    issueRefreshToken(payload) {
        const token = jsonwebtoken_1.default.sign({
            sub: payload.userId,
            provider: payload.provider,
            type: REFRESH_TOKEN_TYPE
        }, this.jwtSecret, { expiresIn: this.refreshTtlSeconds });
        return {
            token,
            expiresIn: this.refreshTtlSeconds
        };
    }
    decodeAccessToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret);
            if (decoded.type !== ACCESS_TOKEN_TYPE) {
                return null;
            }
            return decoded;
        }
        catch {
            return null;
        }
    }
    verifyRefreshToken(token) {
        const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret);
        if (decoded.type !== REFRESH_TOKEN_TYPE) {
            throw new Error('Invalid refresh token');
        }
        return decoded;
    }
    encryptRefreshToken(token) {
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)(ENCRYPTION_ALGORITHM, this.refreshKey, iv);
        const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
    }
    decryptRefreshToken(encoded) {
        const segments = encoded.split('.');
        if (segments.length !== 3) {
            return null;
        }
        const [ivEncoded, dataEncoded, authTagEncoded] = segments;
        try {
            const iv = Buffer.from(ivEncoded, 'base64url');
            const authTag = Buffer.from(authTagEncoded, 'base64url');
            const encryptedData = Buffer.from(dataEncoded, 'base64url');
            const decipher = (0, crypto_1.createDecipheriv)(ENCRYPTION_ALGORITHM, this.refreshKey, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
            return decrypted.toString('utf8');
        }
        catch {
            return null;
        }
    }
    getAccessTokenTtl() {
        return this.accessTtlSeconds;
    }
    getRefreshTokenTtl() {
        return this.refreshTtlSeconds;
    }
}
exports.TokenService = TokenService;
exports.tokenService = new TokenService();
