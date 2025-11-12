/* eslint-disable no-console */
/**
 * Manual walkthrough harness for Journey J-2 backend verification.
 *
 * Ensures dashboard summary is available, insight action endpoint responds,
 * and biomarker logging succeeds so the frontend cache invalidation path can refresh.
 */

import request from 'supertest';
import prismaClient from '../src/lib/prisma';
import { tokenService } from '../src/modules/identity/token-service';
import { app } from '../src/app';

const prisma = (prismaClient as unknown as { default?: typeof prismaClient }).default ?? prismaClient;

async function run() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'member@example.com' },
    include: { insights: true }
  });

  const access = tokenService.issueAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status
  });

  const token = access.token;

  const summary = await request(app)
    .get('/dashboard/summary')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  console.log('[walkthrough] readiness:', summary.body.readinessScore);
  console.log('[walkthrough] todaysInsight:', summary.body.todaysInsight?.id ?? null);

  const insightId = summary.body.todaysInsight?.id;
  if (insightId) {
    const actionResponse = await request(app)
      .post(`/insights/${insightId}/actions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'RETRY_REQUESTED', notes: 'journey=j2;action_source=dashboard' });

    console.log('[walkthrough] action status:', actionResponse.status);
    console.log('[walkthrough] action body:', actionResponse.body);
  } else {
    console.log('[walkthrough] No insight available for action');
  }

  const logResponse = await request(app)
    .post('/biomarker-logs')
    .set('Authorization', `Bearer ${token}`)
    .send({
      biomarkerId: 'seed-biomarker-hrv',
      value: 88,
      unit: 'ms',
      capturedAt: new Date().toISOString(),
      source: 'MANUAL',
      notes: 'manual-check'
    });

  console.log('[walkthrough] log status:', logResponse.status);
  console.log('[walkthrough] log id:', logResponse.body?.id ?? null);

  const refreshed = await request(app)
    .get('/dashboard/summary')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  console.log('[walkthrough] refreshed insight:', refreshed.body.todaysInsight?.id ?? null);
}

run()
  .catch((error) => {
    console.error('[walkthrough] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof (prisma as any).$disconnect === 'function') {
      await (prisma as any).$disconnect();
    }
  });
