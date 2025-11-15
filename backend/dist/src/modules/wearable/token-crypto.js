"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptWhoopToken = exports.encryptWhoopToken = exports.whoopTokenCrypto = void 0;
const crypto_1 = require("crypto");
const env_1 = __importDefault(require("../../config/env"));
const ALGORITHM = 'aes-256-gcm';
const SALT = 'biohax-whoop-token';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const tokenKey = (0, crypto_1.scryptSync)(env_1.default.WHOOP_TOKEN_ENCRYPTION_KEY, SALT, KEY_LENGTH);
const encrypt = (token) => {
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, tokenKey, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
};
exports.encryptWhoopToken = encrypt;
const decrypt = (payload) => {
    const segments = payload.split('.');
    if (segments.length !== 3) {
        return null;
    }
    const [ivEncoded, dataEncoded, authTagEncoded] = segments;
    try {
        const iv = Buffer.from(ivEncoded, 'base64url');
        const encryptedData = Buffer.from(dataEncoded, 'base64url');
        const authTag = Buffer.from(authTagEncoded, 'base64url');
        const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, tokenKey, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
        return decrypted.toString('utf8');
    }
    catch {
        return null;
    }
};
exports.decryptWhoopToken = decrypt;
exports.whoopTokenCrypto = {
    encrypt,
    decrypt
};
