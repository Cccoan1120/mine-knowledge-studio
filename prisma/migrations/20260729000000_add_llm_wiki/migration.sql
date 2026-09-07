CREATE TYPE "WikiPageStatus" AS ENUM ('planned', 'queued', 'generating', 'ready', 'failed');
CREATE TYPE "WikiJobKind" AS ENUM ('outline', 'page', 'refresh');
CREATE TYPE "WikiJobStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'accepted', 'discarded');

CREATE TABLE "WikiProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "scopeUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WikiProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "status" "WikiPageStatus" NOT NULL DEFAULT 'planned',
    "lastError" TEXT,
    "generatedAt" TIMESTAMP(3),
    "candidateData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiCitation" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "noteId" TEXT,
    "chunkId" TEXT NOT NULL,
    "noteTitle" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WikiCitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiPageLink" (
    "fromPageId" TEXT NOT NULL,
    "toPageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WikiPageLink_pkey" PRIMARY KEY ("fromPageId", "toPageId")
);

CREATE TABLE "WikiGenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT,
    "kind" "WikiJobKind" NOT NULL,
    "status" "WikiJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WikiGenerationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiProject_userId_updatedAt_idx" ON "WikiProject"("userId", "updatedAt");
CREATE UNIQUE INDEX "WikiPage_projectId_slug_key" ON "WikiPage"("projectId", "slug");
CREATE INDEX "WikiPage_projectId_position_idx" ON "WikiPage"("projectId", "position");
CREATE INDEX "WikiCitation_pageId_idx" ON "WikiCitation"("pageId");
CREATE INDEX "WikiCitation_noteId_idx" ON "WikiCitation"("noteId");
CREATE INDEX "WikiPageLink_toPageId_idx" ON "WikiPageLink"("toPageId");
CREATE UNIQUE INDEX "WikiGenerationJob_leaseToken_key" ON "WikiGenerationJob"("leaseToken");
CREATE INDEX "WikiGenerationJob_userId_status_idx" ON "WikiGenerationJob"("userId", "status");
CREATE INDEX "WikiGenerationJob_projectId_status_idx" ON "WikiGenerationJob"("projectId", "status");
CREATE INDEX "WikiGenerationJob_status_availableAt_idx" ON "WikiGenerationJob"("status", "availableAt");
CREATE INDEX "WikiGenerationJob_status_lockedAt_idx" ON "WikiGenerationJob"("status", "lockedAt");

ALTER TABLE "WikiProject" ADD CONSTRAINT "WikiProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WikiProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiCitation" ADD CONSTRAINT "WikiCitation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiCitation" ADD CONSTRAINT "WikiCitation_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPageLink" ADD CONSTRAINT "WikiPageLink_fromPageId_fkey" FOREIGN KEY ("fromPageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiPageLink" ADD CONSTRAINT "WikiPageLink_toPageId_fkey" FOREIGN KEY ("toPageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiGenerationJob" ADD CONSTRAINT "WikiGenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiGenerationJob" ADD CONSTRAINT "WikiGenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WikiProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiGenerationJob" ADD CONSTRAINT "WikiGenerationJob_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
