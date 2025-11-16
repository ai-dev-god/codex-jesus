-- CreateEnum
CREATE TYPE "StravaSyncStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'REVOKED');

-- CreateTable
CREATE TABLE "StravaIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "athleteId" INTEGER,
    "athleteUsername" TEXT,
    "athleteName" TEXT,
    "athleteAvatarUrl" TEXT,
    "athleteCity" TEXT,
    "athleteCountry" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncStatus" "StravaSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncSummary" JSONB,
    "tokenKeyId" TEXT,
    "tokenRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StravaIntegration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StravaIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StravaLinkSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "StravaLinkSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StravaLinkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StravaActivity" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stravaActivityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sportType" TEXT NOT NULL,
    "distanceMeters" DOUBLE PRECISION,
    "movingTimeSeconds" INTEGER,
    "elapsedTimeSeconds" INTEGER,
    "elevationGainMeters" DOUBLE PRECISION,
    "averageSpeedMps" DOUBLE PRECISION,
    "maxSpeedMps" DOUBLE PRECISION,
    "averageWatts" DOUBLE PRECISION,
    "maxWatts" DOUBLE PRECISION,
    "sufferScore" DOUBLE PRECISION,
    "achievements" INTEGER,
    "kudosCount" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "startDateLocal" TIMESTAMP(3),
    "isCommute" BOOLEAN,
    "isTrainer" BOOLEAN,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StravaActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StravaActivity_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "StravaIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StravaActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StravaIntegration_userId_key" ON "StravaIntegration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StravaLinkSession_state_key" ON "StravaLinkSession"("state");

-- CreateIndex
CREATE INDEX "StravaLinkSession_userId_expiresAt_idx" ON "StravaLinkSession"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StravaActivity_stravaActivityId_key" ON "StravaActivity"("stravaActivityId");

-- CreateIndex
CREATE INDEX "StravaActivity_userId_startDate_idx" ON "StravaActivity"("userId", "startDate");

-- CreateIndex
CREATE INDEX "StravaActivity_integrationId_startDate_idx" ON "StravaActivity"("integrationId", "startDate");

