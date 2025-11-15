-- CreateTable
CREATE TABLE "PanelUploadDownloadToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PanelUploadDownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PanelUploadDownloadToken_token_key" ON "PanelUploadDownloadToken"("token");

-- CreateIndex
CREATE INDEX "PanelUploadDownloadToken_expiresAt_idx" ON "PanelUploadDownloadToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PanelUploadDownloadToken" ADD CONSTRAINT "PanelUploadDownloadToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelUploadDownloadToken" ADD CONSTRAINT "PanelUploadDownloadToken_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "PanelUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

