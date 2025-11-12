import request from 'supertest';

import { app } from '../app';

describe('GET /healthz', () => {
  it('returns service health metadata', async () => {
    const response = await request(app).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'biohax-backend'
    });
  });
});
