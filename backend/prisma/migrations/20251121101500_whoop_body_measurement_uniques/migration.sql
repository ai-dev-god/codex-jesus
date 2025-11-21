-- Align WhoopBodyMeasurement indexes with new Prisma schema
DROP INDEX IF EXISTS "WhoopBodyMeasurement_userId_capturedAt_idx";

CREATE UNIQUE INDEX "WhoopBodyMeasurement_userId_capturedAt_key" ON "WhoopBodyMeasurement"("userId", "capturedAt");

CREATE INDEX IF NOT EXISTS "WhoopBodyMeasurement_whoopUserId_capturedAt_idx" ON "WhoopBodyMeasurement"("whoopUserId", "capturedAt");

