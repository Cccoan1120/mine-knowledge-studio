CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "KnowledgeIndexStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "headingPath" TEXT[] NOT NULL,
    "content" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "searchTokens" TEXT NOT NULL,
    "indexVersion" INTEGER NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeIndexJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "KnowledgeIndexStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeIndexJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeChunk_noteId_ordinal_key" ON "KnowledgeChunk"("noteId", "ordinal");
CREATE INDEX "KnowledgeChunk_userId_noteId_idx" ON "KnowledgeChunk"("userId", "noteId");
CREATE INDEX "KnowledgeChunk_searchTokens_gin_idx"
    ON "KnowledgeChunk" USING GIN (to_tsvector('simple', "searchTokens"));
CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx"
    ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);

CREATE UNIQUE INDEX "KnowledgeIndexJob_noteId_key" ON "KnowledgeIndexJob"("noteId");
CREATE INDEX "KnowledgeIndexJob_userId_status_idx" ON "KnowledgeIndexJob"("userId", "status");
CREATE INDEX "KnowledgeIndexJob_status_availableAt_idx" ON "KnowledgeIndexJob"("status", "availableAt");

ALTER TABLE "KnowledgeChunk"
    ADD CONSTRAINT "KnowledgeChunk_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeChunk"
    ADD CONSTRAINT "KnowledgeChunk_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeIndexJob"
    ADD CONSTRAINT "KnowledgeIndexJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeIndexJob"
    ADD CONSTRAINT "KnowledgeIndexJob_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
