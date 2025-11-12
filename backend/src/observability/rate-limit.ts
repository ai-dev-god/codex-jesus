import type { Request, RequestHandler, Response } from 'express';
import { createClient, type RedisClientType } from 'redis';

import env from '../config/env';
import { baseLogger } from './logger';

type RateLimitStore = {
  increment(key: string, windowSeconds: number): Promise<number>;
};

type RateLimitScope = string;

export type RateLimitOptions = {
  key: (req: Request) => string;
  max: number;
  windowSeconds: number;
  scope?: RateLimitScope;
  store?: RateLimitStore;
  onLimit?: (req: Request, res: Response) => void;
};

class RedisRateLimitStore implements RateLimitStore {
  private readonly client: RedisClientType;
  private readonly ready: Promise<void>;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on('error', (error) => {
      baseLogger.warn('Redis rate limit client error', {
        component: 'rate-limit',
        error: error instanceof Error ? error.message : String(error)
      });
    });
    this.ready = this.client
      .connect()
      .then(() => undefined)
      .catch((error) => {
        baseLogger.error('Failed to connect Redis rate limiter', {
          component: 'rate-limit',
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    });
  }

  async increment(key: string, windowSeconds: number): Promise<number> {
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
    })) as number;

    const count = typeof result === 'number' ? result : Number(result);
    return Number.isNaN(count) ? 0 : count;
  }
}

type MemoryBucket = {
  expiresAt: number;
  count: number;
};

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, MemoryBucket>();

  async increment(key: string, windowSeconds: number): Promise<number> {
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

export const createRateLimitStore = (): RateLimitStore => {
  if (env.REDIS_URL) {
    try {
      return new RedisRateLimitStore(env.REDIS_URL);
    } catch (error) {
      baseLogger.warn('Falling back to in-memory rate limit store', {
        component: 'rate-limit',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return new InMemoryRateLimitStore();
};

const RATE_LIMIT_HEADERS = {
  limit: 'X-RateLimit-Limit',
  remaining: 'X-RateLimit-Remaining',
  reset: 'X-RateLimit-Reset',
  retryAfter: 'Retry-After'
} as const;

const RATE_LIMIT_ERROR = {
  message: 'Too many requests. Please retry later.',
  code: 'RATE_LIMITED'
} as const;

const buildKey = (scope: RateLimitScope, key: string): string => `${scope}:${key}`;

export const rateLimit = (options: RateLimitOptions): RequestHandler => {
  const store = options.store ?? createRateLimitStore();
  const scope = options.scope ?? 'default';
  const logger = baseLogger.with({ component: 'rate-limit', defaultFields: { scope } });

  return async (req, res, next) => {
    let requestKey: string;
    try {
      requestKey = options.key(req);
    } catch (error) {
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
    } catch (error) {
      logger.error('Rate limiter store failure; allowing request', {
        error: error instanceof Error ? error.message : String(error)
      });
      next();
      return;
    }

    next();
  };
};
