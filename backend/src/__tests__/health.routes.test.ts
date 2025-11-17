import express from 'express';
import request from 'supertest';

import { createHealthRouter } from '../routes/health';
import type { HealthService } from '../observability/health/service';

const createMockService = () => ({
  liveness: jest.fn(),
  readiness: jest.fn()
});

describe('health router', () => {
  it('returns liveness snapshot', async () => {
    const service = createMockService();
    const healthService = service as unknown as HealthService;
    const now = new Date().toISOString();
    service.liveness.mockResolvedValue({
      status: 'ok',
      service: 'biohax-backend',
      timestamp: now,
      uptimeSeconds: 42
    });

    const app = express();
    app.use('/healthz', createHealthRouter({ service: healthService }));

    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'biohax-backend',
      timestamp: now,
      uptimeSeconds: 42
    });
    expect(service.liveness).toHaveBeenCalled();
  });

  it('returns readiness snapshot with 503 when status is fail', async () => {
    const service = createMockService();
    const healthService = service as unknown as HealthService;
    const readiness = {
      status: 'fail' as const,
      checkedAt: new Date().toISOString(),
      components: {
        database: { status: 'fail' as const, checkedAt: new Date().toISOString() },
        redis: { status: 'degraded' as const, checkedAt: new Date().toISOString() },
        queues: { status: 'degraded' as const, totalPending: 3, details: [] },
        integrations: {
          status: 'fail' as const,
          checkedAt: new Date().toISOString(),
          results: []
        },
        metrics: { generatedAt: new Date().toISOString(), http: [] }
      }
    };
    service.readiness.mockResolvedValue(readiness);

    const app = express();
    app.use('/healthz', createHealthRouter({ service: healthService }));

    const response = await request(app).get('/healthz/readiness');
    expect(response.status).toBe(503);
    expect(response.body).toEqual(readiness);
    expect(service.readiness).toHaveBeenCalled();
  });
});
