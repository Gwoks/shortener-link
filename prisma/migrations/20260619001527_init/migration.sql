-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "MetaStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "RefCategory" AS ENUM ('SOCIAL', 'SEARCH', 'DIRECT', 'REFERRAL', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "aliasDisplay" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "ownerId" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "guestKey" TEXT,
    "status" "LinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "metaStatus" "MetaStatus" NOT NULL DEFAULT 'PENDING',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxClicks" INTEGER,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickEvent" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "isUnique" BOOLEAN NOT NULL,
    "referrerCategory" "RefCategory" NOT NULL,
    "referrerHost" TEXT,
    "country" TEXT,
    "city" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "streamId" TEXT NOT NULL,

    CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickRollup" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "uniques" INTEGER NOT NULL DEFAULT 0,
    "byReferrer" JSONB NOT NULL DEFAULT '{}',
    "byCountry" JSONB NOT NULL DEFAULT '{}',
    "byDevice" JSONB NOT NULL DEFAULT '{}',
    "byBrowser" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ClickRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSeen" (
    "linkId" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorSeen_pkey" PRIMARY KEY ("linkId","visitorKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Link_code_key" ON "Link"("code");

-- CreateIndex
CREATE INDEX "Link_ownerId_createdAt_idx" ON "Link"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Link_status_expiresAt_idx" ON "Link"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Link_guestKey_idx" ON "Link"("guestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClickEvent_streamId_key" ON "ClickEvent"("streamId");

-- CreateIndex
CREATE INDEX "ClickEvent_linkId_occurredAt_idx" ON "ClickEvent"("linkId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClickRollup_linkId_day_key" ON "ClickRollup"("linkId", "day");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickRollup" ADD CONSTRAINT "ClickRollup_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;
