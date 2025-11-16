"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsealLabPayload = exports.sealLabPayload = void 0;
const crypto_1 = require("crypto");
const env_1 = __importDefault(require("../../config/env"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const DEFAULT_DEV_KEY = Buffer.from('dev-lab-seal-key-32byte-secret!!');
const decodeSealingKey = () => {
    const raw = env_1.default.LAB_UPLOAD_SEALING_KEY ?? '';
    if (!raw) {
        if (env_1.default.NODE_ENV === 'production') {
            throw new Error('LAB_UPLOAD_SEALING_KEY is not configured');
        }
        return DEFAULT_DEV_KEY;
    }
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length !== KEY_LENGTH) {
        if (env_1.default.NODE_ENV === 'production') {
            throw new Error('LAB_UPLOAD_SEALING_KEY must be a base64-encoded 256-bit value');
        }
        return DEFAULT_DEV_KEY;
    }
    return buffer;
};
let cachedKey = null;
const getSealingKey = () => {
    if (!cachedKey) {
        cachedKey = decodeSealingKey();
    }
    return cachedKey;
};
const sealLabPayload = (payload) => {
    const key = getSealingKey();
    const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
        ciphertext,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: ALGORITHM
    };
};
exports.sealLabPayload = sealLabPayload;
const unsealLabPayload = (sealed) => {
    const key = getSealingKey();
    const iv = Buffer.from(sealed.iv, 'base64');
    const tag = Buffer.from(sealed.authTag, 'base64');
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
};
exports.unsealLabPayload = unsealLabPayload;
