-- AlterTable
ALTER TABLE "BiomarkerMeasurement" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DataDeletionJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DataExportJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LongevityPlan" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LongevityPlanJob" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MembershipInvite" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PanelUpload" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RoomMembership" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StravaActivity" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StravaIntegration" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WhoopWorkout" ALTER COLUMN "updatedAt" DROP DEFAULT,
ADD CONSTRAINT "WhoopWorkout_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "WhoopCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whoopUserId" TEXT NOT NULL,
    "whoopCycleId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "timezoneOffsetMinutes" INTEGER,
    "scoreState" TEXT,
    "strain" DECIMAL(5,2),
    "kilojoule" DECIMAL(10,2),
    "avgHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhoopRecovery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whoopUserId" TEXT NOT NULL,
    "whoopRecoveryId" TEXT NOT NULL,
    "cycleId" TEXT,
    "sleepId" TEXT,
    "scoreState" TEXT,
    "recoveryScore" INTEGER,
    "restingHeartRate" INTEGER,
    "hrvRmssdMilli" DECIMAL(10,4),
    "spo2Percentage" DECIMAL(5,2),
    "skinTempCelsius" DECIMAL(5,2),
    "userCalibrating" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhoopSleep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whoopUserId" TEXT NOT NULL,
    "whoopSleepId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "timezoneOffsetMinutes" INTEGER,
    "nap" BOOLEAN NOT NULL DEFAULT false,
    "scoreState" TEXT,
    "totalInBedTimeMilli" INTEGER,
    "totalAwakeTimeMilli" INTEGER,
    "totalNoDataTimeMilli" INTEGER,
    "totalLightSleepTimeMilli" INTEGER,
    "totalSlowWaveSleepTimeMilli" INTEGER,
    "totalRemSleepTimeMilli" INTEGER,
    "sleepCycleCount" INTEGER,
    "disturbanceCount" INTEGER,
    "sleepScore" INTEGER,
    "respiratoryRate" DECIMAL(5,2),
    "sleepEfficiency" DECIMAL(5,2),
    "sleepConsistency" DECIMAL(5,2),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopSleep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhoopCycle_whoopCycleId_key" ON "WhoopCycle"("whoopCycleId");

-- CreateIndex
CREATE INDEX "WhoopCycle_userId_startTime_idx" ON "WhoopCycle"("userId", "startTime");

-- CreateIndex
CREATE INDEX "WhoopCycle_whoopUserId_startTime_idx" ON "WhoopCycle"("whoopUserId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "WhoopRecovery_whoopRecoveryId_key" ON "WhoopRecovery"("whoopRecoveryId");

-- CreateIndex
CREATE INDEX "WhoopRecovery_userId_cycleId_idx" ON "WhoopRecovery"("userId", "cycleId");

-- CreateIndex
CREATE INDEX "WhoopRecovery_whoopUserId_cycleId_idx" ON "WhoopRecovery"("whoopUserId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "WhoopSleep_whoopSleepId_key" ON "WhoopSleep"("whoopSleepId");

-- CreateIndex
CREATE INDEX "WhoopSleep_userId_startTime_idx" ON "WhoopSleep"("userId", "startTime");

-- CreateIndex
CREATE INDEX "WhoopSleep_whoopUserId_startTime_idx" ON "WhoopSleep"("whoopUserId", "startTime");

-- AddForeignKey
ALTER TABLE "WhoopCycle" ADD CONSTRAINT "WhoopCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhoopRecovery" ADD CONSTRAINT "WhoopRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhoopSleep" ADD CONSTRAINT "WhoopSleep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
