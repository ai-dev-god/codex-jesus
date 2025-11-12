import request from 'supertest';

import { app } from '../app';

describe('error handler', () => {
  it('formats 404 responses with structured payload', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        status: 404,
        message: expect.stringContaining('Resource not found')
      }
    });
    expect(response.body.error.traceId).toBeDefined();
  });
});
