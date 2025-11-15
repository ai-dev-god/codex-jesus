-- CreateEnum
CREATE TYPE "AdminBackupType" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "AdminBackupStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ServiceApiKeyScope" AS ENUM ('READ', 'WRITE', 'FULL');

-- CreateEnum
CREATE TYPE "ServiceApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "AdminBackupJob" (
    "id" TEXT NOT NULL,
    "type" "AdminBackupType" NOT NULL DEFAULT 'FULL',
    "status" "AdminBackupStatus" NOT NULL DEFAULT 'QUEUED',
    "initiatedById" TEXT,
    "storageUri" TEXT,
    "sizeBytes" BIGINT,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminBackupJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "scope" "ServiceApiKeyScope" NOT NULL DEFAULT 'READ',
    "status" "ServiceApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastRotatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceApiKey_prefix_key" ON "ServiceApiKey"("prefix");

-- AddForeignKey
ALTER TABLE "AdminBackupJob" ADD CONSTRAINT "AdminBackupJob_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceApiKey" ADD CONSTRAINT "ServiceApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceApiKey" ADD CONSTRAINT "ServiceApiKey_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

