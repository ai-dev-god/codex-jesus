"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = exports.createRateLimitStore = exports.InMemoryRateLimitStore = void 0;
const redis_1 = require("redis");
const env_1 = __importDefault(require("../config/env"));
const logger_1 = require("./logger");
class RedisRateLimitStore {
    constructor(url) {
        this.client = (0, redis_1.createClient)({ url });
        this.client.on('error', (error) => {
            logger_1.baseLogger.warn('Redis rate limit client error', {
                component: 'rate-limit',
                error: error instanceof Error ? error.message : String(error)
            });
        });
        this.ready = this.client
            .connect()
            .then(() => undefined)
            .catch((error) => {
            logger_1.baseLogger.error('Failed to connect Redis rate limiter', {
                component: 'rate-limit',
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        });
    }
    async increment(key, windowSeconds) {
        await this.ready;
        const script = `
      local current = redis.call("INCR", KEYS[1])
      if current == 1 then
        redis.call("EXPIRE", KEYS[1], ARGV[1])
      end
      return current
    `;
        const result = (await this.client.eval(script, {
            keys: [key],
            arguments: [String(windowSeconds)]
        }));
        const count = typeof result === 'number' ? result : Number(result);
        return Number.isNaN(count) ? 0 : count;
    }
}
class InMemoryRateLimitStore {
    constructor() {
        this.store = new Map();
    }
    async increment(key, windowSeconds) {
        const now = Date.now();
        const bucket = this.store.get(key);
        if (!bucket || bucket.expiresAt <= now) {
            const expiresAt = now + windowSeconds * 1000;
            this.store.set(key, { count: 1, expiresAt });
            return 1;
        }
        bucket.count += 1;
        this.store.set(key, bucket);
        return bucket.count;
    }
}
exports.InMemoryRateLimitStore = InMemoryRateLimitStore;
const createRateLimitStore = () => {
    if (env_1.default.REDIS_URL) {
        try {
            return new RedisRateLimitStore(env_1.default.REDIS_URL);
        }
        catch (error) {
            logger_1.baseLogger.warn('Falling back to in-memory rate limit store', {
                component: 'rate-limit',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    return new InMemoryRateLimitStore();
};
exports.createRateLimitStore = createRateLimitStore;
const RATE_LIMIT_HEADERS = {
    limit: 'X-RateLimit-Limit',
    remaining: 'X-RateLimit-Remaining',
    reset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After'
};
const RATE_LIMIT_ERROR = {
    message: 'Too many requests. Please retry later.',
    code: 'RATE_LIMITED'
};
const buildKey = (scope, key) => `${scope}:${key}`;
const rateLimit = (options) => {
    const store = options.store ?? (0, exports.createRateLimitStore)();
    const scope = options.scope ?? 'default';
    const logger = logger_1.baseLogger.with({ component: 'rate-limit', defaultFields: { scope } });
    return async (req, res, next) => {
        let requestKey;
        try {
            requestKey = options.key(req);
        }
        catch (error) {
            logger.error('Failed to generate rate limit key; allowing request', {
                error: error instanceof Error ? error.message : String(error)
            });
            next();
            return;
        }
        const scopedKey = buildKey(scope, requestKey);
        try {
            const count = await store.increment(scopedKey, options.windowSeconds);
            const remaining = Math.max(0, options.max - count);
            res.setHeader(RATE_LIMIT_HEADERS.limit, String(options.max));
            res.setHeader(RATE_LIMIT_HEADERS.remaining, String(Math.max(0, remaining)));
            res.setHeader(RATE_LIMIT_HEADERS.reset, String(options.windowSeconds));
            if (count > options.max) {
                res.setHeader(RATE_LIMIT_HEADERS.retryAfter, String(options.windowSeconds));
                req.log?.warn('Rate limit exceeded', {
                    requestKey,
                    scope,
                    max: options.max,
                    windowSeconds: options.windowSeconds
                });
                options.onLimit?.(req, res);
                res.status(429).json({
                    error: {
                        ...RATE_LIMIT_ERROR,
                        retryAfter: options.windowSeconds,
                        scope
                    }
                });
                return;
            }
        }
        catch (error) {
            logger.error('Rate limiter store failure; allowing request', {
                error: error instanceof Error ? error.message : String(error)
            });
            next();
            return;
        }
        next();
    };
};
exports.rateLimit = rateLimit;
