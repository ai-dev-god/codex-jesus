"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemoryCacheClient = exports.getCacheClient = void 0;
const redis_1 = require("redis");
const env_1 = __importDefault(require("../config/env"));
class MemoryCacheClient {
    constructor() {
        this.store = new Map();
    }
    async get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return null;
        }
        if (entry.expiresAt !== Number.POSITIVE_INFINITY && entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttlSeconds) {
        const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.POSITIVE_INFINITY;
        this.store.set(key, { value, expiresAt });
    }
    async del(key) {
        this.store.delete(key);
    }
}
class RedisCacheClient {
    constructor(client) {
        this.client = client;
        this.client.on('error', (error) => {
            console.error('[cache] Redis client error', error);
        });
        this.ready = this.client
            .connect()
            .then(() => undefined)
            .catch((error) => {
            console.error('[cache] Failed to connect to Redis', error);
            throw error;
        });
    }
    async ensureReady() {
        await this.ready;
    }
    async get(key) {
        await this.ensureReady();
        const value = await this.client.get(key);
        return value ?? null;
    }
    async set(key, value, ttlSeconds) {
        await this.ensureReady();
        if (ttlSeconds > 0) {
            await this.client.set(key, value, {
                EX: ttlSeconds
            });
            return;
        }
        await this.client.set(key, value);
    }
    async del(key) {
        await this.ensureReady();
        await this.client.del(key);
    }
}
let cacheClient = null;
const getCacheClient = () => {
    if (cacheClient) {
        return cacheClient;
    }
    if (env_1.default.REDIS_URL) {
        try {
            const redis = (0, redis_1.createClient)({ url: env_1.default.REDIS_URL });
            cacheClient = new RedisCacheClient(redis);
            return cacheClient;
        }
        catch (error) {
            console.warn('[cache] Falling back to in-memory cache client', error);
        }
    }
    cacheClient = new MemoryCacheClient();
    return cacheClient;
};
exports.getCacheClient = getCacheClient;
const createMemoryCacheClient = () => new MemoryCacheClient();
exports.createMemoryCacheClient = createMemoryCacheClient;
