import express from 'express';
import request from 'supertest';

import { InMemoryRateLimitStore, rateLimit } from '../observability/rate-limit';

describe('rateLimit middleware', () => {
  it('responds with 429 when the rate limit is exceeded', async () => {
    const app = express();
    app.use(express.json());

    const limiter = rateLimit({
      store: new InMemoryRateLimitStore(),
      scope: 'test',
      max: 2,
      windowSeconds: 60,
      key: () => 'test-key'
    });

    app.post('/sensitive', limiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    await request(app).post('/sensitive');
    await request(app).post('/sensitive');
    const response = await request(app).post('/sensitive');

    expect(response.status).toBe(429);
    expect(response.headers['x-ratelimit-limit']).toBe('2');
    expect(response.headers['x-ratelimit-remaining']).toBe('0');
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'RATE_LIMITED'
        })
      })
    );
  });

  it('allows the request when the rate limit store errors', async () => {
    const faultyStore = {
      increment: jest.fn().mockRejectedValue(new Error('store unavailable'))
    };

    const limiter = rateLimit({
      store: faultyStore,
      scope: 'test',
      max: 1,
      windowSeconds: 60,
      key: () => 'faulty-key'
    });

    const app = express();
    app.post('/sensitive', limiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).post('/sensitive');
    expect(response.status).toBe(200);
    expect(faultyStore.increment).toHaveBeenCalled();
  });
});
