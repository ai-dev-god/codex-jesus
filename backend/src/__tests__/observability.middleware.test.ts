import express from 'express';
import request from 'supertest';

import { observabilityMiddleware } from '../observability/middleware';
import { requestContext } from '../modules/observability-ops/request-context';
import { getMetricsSnapshot, resetMetrics } from '../observability/metrics';

describe('observability middleware', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('records HTTP metrics for successful requests', async () => {
    const app = express();
    app.use(requestContext);
    app.use(observabilityMiddleware);
    app.get('/status', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/status');
    expect(response.status).toBe(200);

    const snapshot = getMetricsSnapshot();
    expect(snapshot.http).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: '/status',
          count: 1,
          statusCounts: expect.objectContaining({ '200': 1 })
        })
      ])
    );
  });
});
