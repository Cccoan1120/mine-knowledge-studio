CREATE TABLE "GovernanceDismissal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GovernanceDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GovernanceDismissal_userId_kind_fingerprint_key"
ON "GovernanceDismissal"("userId", "kind", "fingerprint");

CREATE INDEX "GovernanceDismissal_userId_kind_idx"
ON "GovernanceDismissal"("userId", "kind");

ALTER TABLE "GovernanceDismissal"
ADD CONSTRAINT "GovernanceDismissal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
