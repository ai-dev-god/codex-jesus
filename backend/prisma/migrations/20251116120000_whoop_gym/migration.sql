-- CreateTable
CREATE TABLE "WhoopWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whoopUserId" TEXT NOT NULL,
    "whoopWorkoutId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "sportCategory" TEXT,
    "sportTypeId" INTEGER,
    "scoreState" TEXT,
    "intensityLevel" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "timezoneOffsetMinutes" INTEGER,
    "strain" DECIMAL(5, 2),
    "avgHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "calories" INTEGER,
    "distanceMeters" INTEGER,
    "energyKilojoule" INTEGER,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "WhoopWorkout_whoopWorkoutId_key" ON "WhoopWorkout"("whoopWorkoutId");

-- CreateIndex
CREATE INDEX "WhoopWorkout_userId_startTime_idx" ON "WhoopWorkout"("userId", "startTime");

-- CreateIndex
CREATE INDEX "WhoopWorkout_whoopUserId_startTime_idx" ON "WhoopWorkout"("whoopUserId", "startTime");

-- AddForeignKey
ALTER TABLE "WhoopWorkout" ADD CONSTRAINT "WhoopWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

