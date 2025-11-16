-- CreateEnum
CREATE TYPE "PanelUploadSessionStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED');

-- AlterTable
ALTER TABLE "PanelUpload"
  ADD COLUMN "byteSize" INTEGER,
  ADD COLUMN "sha256Hash" TEXT,
  ADD COLUMN "sealedKeyVersion" TEXT,
  ADD COLUMN "sealedStorageKey" TEXT,
  ADD COLUMN "uploadSessionId" TEXT;

-- CreateTable
CREATE TABLE "PanelUploadSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "kmsKeyName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "status" "PanelUploadSessionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanelUploadSession_storageKey_key" ON "PanelUploadSession"("storageKey");

-- CreateIndex
CREATE INDEX "PanelUploadSession_userId_idx" ON "PanelUploadSession"("userId");

-- CreateIndex
CREATE INDEX "PanelUploadSession_status_expiresAt_idx" ON "PanelUploadSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PanelUpload_uploadSessionId_idx" ON "PanelUpload"("uploadSessionId");

-- AddForeignKey
ALTER TABLE "PanelUploadSession" ADD CONSTRAINT "PanelUploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelUpload" ADD CONSTRAINT "PanelUpload_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "PanelUploadSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

