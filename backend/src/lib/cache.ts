import { createClient } from 'redis';

import env from '../config/env';

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryCacheClient implements CacheClient {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
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

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Number.POSITIVE_INFINITY;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

type RedisGenericClient = ReturnType<typeof createClient>;

class RedisCacheClient implements CacheClient {
  private readonly client: RedisGenericClient;
  private readonly ready: Promise<void>;

  constructor(client: RedisGenericClient) {
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

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  async get(key: string): Promise<string | null> {
    await this.ensureReady();
    const value = await this.client.get(key);
    return value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.ensureReady();
    if (ttlSeconds > 0) {
      await this.client.set(key, value, {
        EX: ttlSeconds
      });
      return;
    }

    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.ensureReady();
    await this.client.del(key);
  }
}

let cacheClient: CacheClient | null = null;

export const getCacheClient = (): CacheClient => {
  if (cacheClient) {
    return cacheClient;
  }

  if (env.REDIS_URL) {
    try {
      const redis = createClient({ url: env.REDIS_URL });
      cacheClient = new RedisCacheClient(redis);
      return cacheClient;
    } catch (error) {
      console.warn('[cache] Falling back to in-memory cache client', error);
    }
  }

  cacheClient = new MemoryCacheClient();
  return cacheClient;
};

export const createMemoryCacheClient = (): CacheClient => new MemoryCacheClient();
