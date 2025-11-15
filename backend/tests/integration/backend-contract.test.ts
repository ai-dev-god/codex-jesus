import request from 'supertest';

import { app } from '../../src/app';
import prisma from '../../src/lib/prisma';
import { ensureDatabaseReady, resetDatabase, shutdownDatabase } from './support/db';
import { getResponseValidator } from './support/openapi';

const memberCredentials = {
  email: process.env.SEED_MEMBER_EMAIL ?? 'member@example.com',
  password: process.env.SEED_MEMBER_PASSWORD ?? 'PlaywrightSeedPass1!'
};

const expectContract = (validator: Awaited<ReturnType<typeof getResponseValidator>>, payload: unknown): void => {
  const valid = validator(payload);
  if (!valid) {
    // eslint-disable-next-line no-console
    console.error('Contract validation errors', validator.errors);
  }

  expect(valid).toBe(true);
};

describe('Backend integration contract suite', () => {
  let accessToken: string;

  beforeAll(async () => {
    await ensureDatabaseReady();
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    const response = await request(app).post('/auth/login').send(memberCredentials).expect(200);
    accessToken = response.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await shutdownDatabase();
  });

  it('POST /auth/login matches AuthResponse contract', async () => {
    const validator = await getResponseValidator('/auth/login', 'post', '200');
    const response = await request(app).post('/auth/login').send(memberCredentials).expect(200);

    expectContract(validator, response.body);
    expect(response.body.tokens.accessToken).toBeTruthy();
    expect(response.body.tokens.refreshToken).toBeTruthy();
  });

  it('GET /auth/me matches User contract', async () => {
    const validator = await getResponseValidator('/auth/me', 'get', '200');
    const response = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expectContract(validator, response.body);
    expect(response.body.email).toBe(memberCredentials.email);
  });

  it('GET /profiles/me returns seeded profile', async () => {
    const validator = await getResponseValidator('/profiles/me', 'get', '200');
    const response = await request(app)
      .get('/profiles/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expectContract(validator, response.body);
    expect(response.body.displayName).toBeTruthy();
  });

  it('GET /dashboard/summary matches contract', async () => {
    const validator = await getResponseValidator('/dashboard/summary', 'get', '200');
    const response = await request(app)
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expectContract(validator, response.body);
    expect(response.body.cacheState).toBeDefined();
  });

  it('GET /biomarkers returns seeded catalogue', async () => {
    const validator = await getResponseValidator('/biomarkers', 'get', '200');
    const response = await request(app)
      .get('/biomarkers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expectContract(validator, response.body);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('GET /biomarker-logs returns paginated logs', async () => {
    const validator = await getResponseValidator('/biomarker-logs', 'get', '200');
    const response = await request(app)
      .get('/biomarker-logs')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expectContract(validator, response.body);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('POST /biomarker-logs accepts new manual entry', async () => {
    const biomarkerList = await request(app)
      .get('/biomarkers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const biomarkerId = biomarkerList.body[0]?.id;
    expect(biomarkerId).toBeTruthy();

    const validator = await getResponseValidator('/biomarker-logs', 'post', '201');

    const payload = {
      biomarkerId,
      value: 62,
      unit: 'ms',
      capturedAt: new Date().toISOString(),
      source: 'MANUAL',
      notes: 'integration-test-log'
    };

    const response = await request(app)
      .post('/biomarker-logs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    expectContract(validator, response.body);
    expect(response.body.biomarkerId).toBe(biomarkerId);
  });

  it('GET /healthz matches liveness contract', async () => {
    const validator = await getResponseValidator('/health/ping', 'get', '200');
    const response = await request(app).get('/healthz').expect(200);

    expectContract(validator, response.body);
    expect(response.body.status).toBe('ok');
  });
});
