-- CreateEnum
CREATE TYPE "PanelUploadStatus" AS ENUM ('PENDING', 'NORMALIZED', 'FAILED');

-- CreateEnum
CREATE TYPE "PanelUploadSource" AS ENUM ('LAB_REPORT', 'WEARABLE_EXPORT', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "MeasurementStatus" AS ENUM ('RAW', 'NORMALIZED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LongevityPlanStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LongevityPlanJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "PanelUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PanelUploadStatus" NOT NULL DEFAULT 'PENDING',
    "source" "PanelUploadSource" NOT NULL DEFAULT 'LAB_REPORT',
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT,
    "pageCount" INTEGER,
    "rawMetadata" JSONB,
    "normalizedPayload" JSONB,
    "measurementCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PanelUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiomarkerMeasurement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "biomarkerId" TEXT,
    "panelUploadId" TEXT,
    "markerName" TEXT NOT NULL,
    "value" DECIMAL(10,4),
    "unit" TEXT,
    "referenceLow" DECIMAL(10,4),
    "referenceHigh" DECIMAL(10,4),
    "capturedAt" TIMESTAMP(3),
    "status" "MeasurementStatus" NOT NULL DEFAULT 'RAW',
    "source" "BiomarkerSource" NOT NULL DEFAULT 'LAB_UPLOAD',
    "confidence" DECIMAL(5,4),
    "flags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BiomarkerMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LongevityPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LongevityPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "focusAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sections" JSONB,
    "evidence" JSONB,
    "safetyState" JSONB,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LongevityPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LongevityPlanJob" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "requestedById" TEXT,
    "status" "LongevityPlanJobStatus" NOT NULL DEFAULT 'QUEUED',
    "cloudTaskName" TEXT,
    "queue" TEXT,
    "payload" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LongevityPlanJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiResponseAudit" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "role" TEXT,
    "prompt" JSONB,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiResponseAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanelUpload_userId_createdAt_idx" ON "PanelUpload"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BiomarkerMeasurement_userId_capturedAt_idx" ON "BiomarkerMeasurement"("userId", "capturedAt");

-- CreateIndex
CREATE INDEX "LongevityPlan_userId_createdAt_idx" ON "LongevityPlan"("userId", "createdAt");

-- AddColumn
ALTER TABLE "CloudTaskMetadata" ADD COLUMN     "planJobId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CloudTaskMetadata_planJobId_key" ON "CloudTaskMetadata"("planJobId");
-- AddForeignKey
ALTER TABLE "PanelUpload" ADD CONSTRAINT "PanelUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiomarkerMeasurement" ADD CONSTRAINT "BiomarkerMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiomarkerMeasurement" ADD CONSTRAINT "BiomarkerMeasurement_biomarkerId_fkey" FOREIGN KEY ("biomarkerId") REFERENCES "Biomarker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiomarkerMeasurement" ADD CONSTRAINT "BiomarkerMeasurement_panelUploadId_fkey" FOREIGN KEY ("panelUploadId") REFERENCES "PanelUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LongevityPlan" ADD CONSTRAINT "LongevityPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LongevityPlanJob" ADD CONSTRAINT "LongevityPlanJob_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LongevityPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LongevityPlanJob" ADD CONSTRAINT "LongevityPlanJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiResponseAudit" ADD CONSTRAINT "AiResponseAudit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LongevityPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiResponseAudit" ADD CONSTRAINT "AiResponseAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudTaskMetadata" ADD CONSTRAINT "CloudTaskMetadata_planJobId_fkey" FOREIGN KEY ("planJobId") REFERENCES "LongevityPlanJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
