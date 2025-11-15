import request from 'supertest';

import { app } from '../../src/app';
import prisma from '../../src/lib/prisma';
import { ensureDatabaseReady, resetDatabase, shutdownDatabase } from './support/db';

const memberCredentials = {
  email: process.env.SEED_MEMBER_EMAIL ?? 'member@example.com',
  password: process.env.SEED_MEMBER_PASSWORD ?? 'PlaywrightSeedPass1!',
};

const expectError = (payload: unknown) => {
  expect(payload).toBeDefined();
  expect(payload).toHaveProperty('error');
  return (payload as { error: Record<string, unknown> }).error;
};

describe('Rooms API integration', () => {
  let accessToken: string;
  let memberId: string;

  beforeAll(async () => {
    await ensureDatabaseReady();
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();

    const member = await prisma.user.findUnique({
      where: { email: memberCredentials.email },
      select: { id: true },
    });

    if (!member) {
      throw new Error('Seed member record missing; ensure backend/scripts/seed.ts matches test expectations.');
    }

    memberId = member.id;

    const response = await request(app).post('/auth/login').send(memberCredentials).expect(200);
    accessToken = response.body.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await shutdownDatabase();
  });

  it('joins seeded open room invites and returns active membership details', async () => {
    const response = await request(app)
      .post('/rooms/join')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ inviteCode: 'open1234' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      inviteCode: 'OPEN1234',
      membership: expect.objectContaining({
        userId: memberId,
        role: 'PLAYER',
        status: 'ACTIVE',
      }),
    });

    expect(response.body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: memberId, role: 'PLAYER', status: 'ACTIVE' }),
        expect.objectContaining({ role: 'HOST', status: 'ACTIVE' }),
      ]),
    );
  });

  it('caps capacity and surfaces canonical ROOM_FULL errors', async () => {
    const response = await request(app)
      .post('/rooms/join')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ inviteCode: 'FULL9999' })
      .expect(409);

    const error = expectError(response.body);
    expect(error).toMatchObject({
      code: 'ROOM_FULL',
      status: 409,
    });
    expect(typeof error.message === 'string' ? error.message.toLowerCase() : '').toContain('room is full');
  });

  it('returns INVALID_CODE when invite lookups miss', async () => {
    const response = await request(app)
      .post('/rooms/join')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ inviteCode: 'missing-code' })
      .expect(404);

    const error = expectError(response.body);
    expect(error).toMatchObject({
      code: 'INVALID_CODE',
      status: 404,
    });
  });

  it('retrieves room detail after join with stable membership payload', async () => {
    const joinResponse = await request(app)
      .post('/rooms/join')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ inviteCode: 'OPEN1234' })
      .expect(200);

    const roomId: string = joinResponse.body.id;

    const detailResponse = await request(app)
      .get(`/rooms/${roomId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailResponse.body).toMatchObject({
      id: roomId,
      inviteCode: 'OPEN1234',
      membership: expect.objectContaining({
        userId: memberId,
        status: 'ACTIVE',
      }),
    });
    expect(Array.isArray(detailResponse.body.members)).toBe(true);
    expect(detailResponse.body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: memberId }),
        expect.objectContaining({ role: 'HOST' }),
      ]),
    );
  });
});

