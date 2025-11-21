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
    "strain" DECIMAL(5, 2),
    "kilojoule" DECIMAL(10, 2),
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
    "score" INTEGER,
    "restingHeartRate" INTEGER,
    "hrvRmssdMilli" DECIMAL(10, 4),
    "spo2Percentage" DECIMAL(5, 2),
    "skinTempCelsius" DECIMAL(5, 2),
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
    "cycleId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "timezoneOffsetMinutes" INTEGER,
    "nap" BOOLEAN NOT NULL DEFAULT false,
    "scoreState" TEXT,
    "score" INTEGER,
    "performance" INTEGER,
    "consistency" INTEGER,
    "efficiency" INTEGER,
    "respiratoryRate" DECIMAL(5, 2),
    "totalInBedSeconds" INTEGER,
    "totalAwakeSeconds" INTEGER,
    "totalLightSleepSeconds" INTEGER,
    "totalSlowWaveSleepSeconds" INTEGER,
    "totalRemSleepSeconds" INTEGER,
    "sleepCycleCount" INTEGER,
    "disturbanceCount" INTEGER,
    "sleepNeedSeconds" INTEGER,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopSleep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhoopBodyMeasurement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whoopUserId" TEXT NOT NULL,
    "heightMeter" DECIMAL(5, 3),
    "weightKg" DECIMAL(6, 3),
    "maxHeartRate" INTEGER,
    "rawPayload" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhoopBodyMeasurement_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "WhoopRecovery_userId_createdAt_idx" ON "WhoopRecovery"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhoopSleep_whoopSleepId_key" ON "WhoopSleep"("whoopSleepId");

-- CreateIndex
CREATE INDEX "WhoopSleep_userId_startTime_idx" ON "WhoopSleep"("userId", "startTime");

-- CreateIndex
CREATE INDEX "WhoopBodyMeasurement_userId_capturedAt_idx" ON "WhoopBodyMeasurement"("userId", "capturedAt");

-- AddForeignKey
ALTER TABLE "WhoopCycle" ADD CONSTRAINT "WhoopCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhoopRecovery" ADD CONSTRAINT "WhoopRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhoopSleep" ADD CONSTRAINT "WhoopSleep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhoopBodyMeasurement" ADD CONSTRAINT "WhoopBodyMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

