-- CreateEnum
CREATE TYPE "MembershipInviteStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "MembershipInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "status" "MembershipInviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "lastRedeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipInviteRedemption" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipInviteRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipInvite_code_key" ON "MembershipInvite"("code");

-- CreateIndex
CREATE INDEX "MembershipInvite_email_idx" ON "MembershipInvite"("email");

-- CreateIndex
CREATE INDEX "MembershipInvite_status_expiresAt_idx" ON "MembershipInvite"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MembershipInviteRedemption_inviteId_redeemedAt_idx" ON "MembershipInviteRedemption"("inviteId", "redeemedAt");

-- CreateIndex
CREATE INDEX "MembershipInviteRedemption_userId_redeemedAt_idx" ON "MembershipInviteRedemption"("userId", "redeemedAt");

-- AddForeignKey
ALTER TABLE "MembershipInvite" ADD CONSTRAINT "MembershipInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- AddForeignKey
ALTER TABLE "MembershipInviteRedemption" ADD CONSTRAINT "MembershipInviteRedemption_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "MembershipInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipInviteRedemption" ADD CONSTRAINT "MembershipInviteRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

