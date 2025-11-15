"use strict";
/* eslint-disable no-console */
/**
 * Manual walkthrough harness for Journey J-2 backend verification.
 *
 * Ensures dashboard summary is available, insight action endpoint responds,
 * and biomarker logging succeeds so the frontend cache invalidation path can refresh.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const prisma_1 = __importDefault(require("../src/lib/prisma"));
const token_service_1 = require("../src/modules/identity/token-service");
const app_1 = require("../src/app");
const prisma = prisma_1.default.default ?? prisma_1.default;
async function run() {
    const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'member@example.com' },
        include: { insights: true }
    });
    const access = token_service_1.tokenService.issueAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status
    });
    const token = access.token;
    const summary = await (0, supertest_1.default)(app_1.app)
        .get('/dashboard/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    console.log('[walkthrough] readiness:', summary.body.readinessScore);
    console.log('[walkthrough] todaysInsight:', summary.body.todaysInsight?.id ?? null);
    const insightId = summary.body.todaysInsight?.id;
    if (insightId) {
        const actionResponse = await (0, supertest_1.default)(app_1.app)
            .post(`/insights/${insightId}/actions`)
            .set('Authorization', `Bearer ${token}`)
            .send({ actionType: 'RETRY_REQUESTED', notes: 'journey=j2;action_source=dashboard' });
        console.log('[walkthrough] action status:', actionResponse.status);
        console.log('[walkthrough] action body:', actionResponse.body);
    }
    else {
        console.log('[walkthrough] No insight available for action');
    }
    const logResponse = await (0, supertest_1.default)(app_1.app)
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
    const refreshed = await (0, supertest_1.default)(app_1.app)
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
    if (typeof prisma.$disconnect === 'function') {
        await prisma.$disconnect();
    }
});
