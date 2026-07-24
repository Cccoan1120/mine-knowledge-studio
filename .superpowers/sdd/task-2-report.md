# Task 2 Report: pgvector Storage and Durable Indexing Worker

## Scope

Implemented the persistent indexing foundation without changing `/api/ai/ask`, the production server entrypoint, or React UI:

- Prisma models and migration for `KnowledgeChunk` and `KnowledgeIndexJob`.
- pgvector extension setup, simple-text GIN search index, cosine HNSW vector index, cascading ownership relations, and job/status/claim indexes.
- Transactional Prisma-store indexing methods plus memory-store basic-mode no-ops.
- Dedicated embedding configuration and a sanitized batch embeddings client.
- Injectable one-job indexing worker with polling, stale-hash protection, lock recovery, and durable retries.

The retry ambiguity was resolved with the parent before implementation: one initial execution plus three automatic retries after 5 seconds, 30 seconds, and 5 minutes. A fourth failed execution is terminal.

## RED Evidence

The first focused run occurred after only the tests were added:

```text
$ pnpm test prisma/schema.test.js server/ai/config.test.js server/ai/embeddingClient.test.js server/store/memoryStore.test.js server/store/prismaStore.test.js server/rag/indexingWorker.test.js

Test Files  6 failed (6)
Tests       15 failed (15)

Cannot find module './embeddingClient.js'
Cannot find module './indexingWorker.js'
expected schema to contain 'model KnowledgeChunk'
ENOENT ... 20260724000000_add_knowledge_indexing/migration.sql
TypeError: getEmbeddingConfig is not a function
TypeError: store.getIndexStatus is not a function
```

The Prisma-store tests also failed because the existing factory did not accept an injected store and attempted to load an ungenerated client. This was the expected missing persistence seam, not a false-positive assertion.

After the initial GREEN pass, self-review identified two durability gaps and added regressions before changing production code:

```text
$ pnpm test server/store/prismaStore.test.js

Test Files  1 failed (1)
Tests       2 failed | 7 passed (9)

rechecks and locks current note content before a backfill upsert
does not replace chunks when the locked note content no longer matches the claimed hash
```

The failures proved that backfill did not yet re-read content under `FOR UPDATE` and chunk completion did not yet request the explicit 60-second transaction timeout.

## GREEN Evidence

Initial focused GREEN:

```text
Test Files  6 passed (6)
Tests       26 passed (26)
```

Self-review regression GREEN:

```text
$ pnpm test server/store/prismaStore.test.js
Test Files  1 passed (1)
Tests       9 passed (9)
```

Final focused GREEN:

```text
$ pnpm test prisma/schema.test.js server/ai/config.test.js server/ai/embeddingClient.test.js server/store/memoryStore.test.js server/store/prismaStore.test.js server/rag/indexingWorker.test.js
Test Files  6 passed (6)
Tests       27 passed (27)
```

## Implementation Details

### Persistence and migration

- `KnowledgeChunk` stores owner/note identity, ordinal, heading path, content and offsets, token count, content hash, search tokens, index version, `vector(1536)`, and timestamps.
- `KnowledgeIndexJob` has a unique `noteId`, owner, content hash, enum status, attempts, availability/lock timestamps, safe last error, and timestamps.
- Four foreign keys cascade from users and notes. Unique and composite indexes support note cleanup, user status aggregation, and due-job claiming.
- The migration enables `vector`, adds `to_tsvector('simple', "searchTokens")` GIN indexing, and adds cosine HNSW indexing.

### Store contract

- Note creation and content edits upsert a pending job in the same transaction. Metadata-only edits do not reindex.
- User backfill first identifies missing/stale jobs, then locks and re-reads each current note before upserting so an older snapshot cannot overwrite a concurrent edit.
- Status aggregation and failed-job reset are owner-scoped.
- Claiming uses `FOR UPDATE SKIP LOCKED`, increments attempts atomically, and recovers processing locks older than five minutes. Expired fourth executions become terminal.
- Chunk replacement locks both the note and current job, checks the claimed and current hashes, replaces chunks, and marks ready in one transaction. A 60-second transaction timeout avoids Prisma's short interactive-transaction default for larger notes.
- Failure persistence accepts only a retry time and stores the fixed text `Indexing failed.`; raw provider errors never enter the store.
- Memory mode reports `mode: "basic"` and implements no-op worker methods so the database-free demo remains usable.

### Embeddings and worker

- Dedicated embedding key/base URL fall back to shared AI configuration. The model defaults to `text-embedding-3-small`; configured dimensions must equal 1536.
- The client batches input to `/embeddings` with a 60-second timeout, orders results by provider index, and validates count, finite numeric values, and exact dimensions.
- HTTP, transport, and malformed-response errors are replaced with fixed safe messages.
- `runOnce()` claims no more than one job, chunks the latest content with Task 1 primitives, embeds all non-empty chunks in one batch, adds search tokens/hash/version metadata, and calls the store's hash-guarded replacement.
- Empty notes become ready with zero chunks and no provider call. `start()`/`stop()` use a non-overlapping polling loop but are intentionally not wired into `server/index.js`.
- Worker logs contain only a fixed event, job ID, attempt number, and retry flag. They never include note content, source text, provider errors, keys, or connection strings.

## Final Verification

```text
$ pnpm db:generate
Generated Prisma Client (v7.8.0)
status before generation == status after generation

$ pnpm test
Test Files  20 passed (20)
Tests       90 passed (90)

$ pnpm build
tsc -b && vite build
2032 modules transformed
built successfully

$ pnpm lint
oxlint
exit 0

$ git diff --check
exit 0
```

## Self-Review

- Confirmed no ask-route, server-entrypoint, or React files changed.
- Confirmed every query that accepts identifiers uses parameters; source content and vectors are parameters rather than interpolated SQL.
- Confirmed job load, status, retry, backfill, replacement, and failure updates are owner-scoped.
- Confirmed stale completions cannot delete current chunks or mark an outdated job ready.
- Confirmed the three exact retry delays are observable and terminal failure occurs only after execution four.
- Confirmed Prisma generation created no tracked or unrelated changes.

## Remaining Limitation

No live PostgreSQL/pgvector service was available in this task, so the migration was validated by schema generation, static migration tests, and parameterized store fakes rather than by applying it to a real database.

## Concurrency Review Fix

Review found that `contentHash` alone was not a sufficient worker lease: an expired worker could finish after the same unchanged note had been reclaimed with a higher attempt number. The claimed `attempts` value is now the lease fence.

- The row-lock query that begins chunk replacement requires the same job ID, owner, note, content hash, `processing` status, and claimed attempt.
- The final `ready` update repeats the same attempt fence.
- Failed/rescheduled transitions also require the same claimed attempt, so an older worker cannot move a newer claim back to `pending` or `failed`.
- The worker already forwarded the full claimed job object; worker regressions now explicitly verify that `attempts` reaches both successful and stale replacement calls.
- Terminal stale-lock cleanup now compares `lockedAt` with PostgreSQL `CURRENT_TIMESTAMP`, matching the claim query's database clock.
- A `(status, lockedAt)` index now supports stale processing-job scans.

### Review RED

The regressions were added before the concurrency implementation changed:

```text
$ pnpm test server/store/prismaStore.test.js server/rag/indexingWorker.test.js prisma/schema.test.js

Test Files  2 failed | 1 passed (3)
Tests       7 failed | 13 passed (20)

failed: recovers expired locks and claims one due job with skip-locked semantics
failed: stores only a fixed safe failure and either reschedules or terminates the current claim
failed: does not reschedule an expired worker after a newer attempt claims the job
failed: marks ready only when the completion has the current claimed attempt
failed: does not let an expired worker replace chunks after a newer attempt claims the job
failed: defines durable chunk and index job models
failed: enables pgvector and creates search, vector, ownership, and claiming indexes
```

These failures showed the old JavaScript-clock cleanup, missing attempt predicates, and absent stale-lock index. The worker test file passed because the existing worker already passed the full claim, including `attempts`, into the store.

A follow-up worker regression then verified that a rejected, fenced failure transition is reported as stale rather than as a successful reschedule:

```text
$ pnpm test server/rag/indexingWorker.test.js
Test Files  1 failed (1)
Tests       1 failed | 6 passed (7)

expected { status: 'stale', jobId: 'job-1' }
received { status: 'rescheduled', jobId: 'job-1' }
```

### Review GREEN

```text
$ pnpm test server/store/prismaStore.test.js server/rag/indexingWorker.test.js prisma/schema.test.js
Test Files  3 passed (3)
Tests       21 passed (21)

$ pnpm test
Test Files  20 passed (20)
Tests       94 passed (94)

$ pnpm db:generate
Generated Prisma Client (v7.8.0)
status before generation == status after generation

$ pnpm lint
oxlint
exit 0

$ pnpm build
tsc -b && vite build
2032 modules transformed
built successfully
```

Live PostgreSQL/pgvector migration and lease-race integration remain intentionally unclaimed; they are deferred to the later CI/database integration task.

## Reusable Lease Review Fix

A second review identified that `attempts` is reusable after enqueue or manual retry resets it to zero. It therefore cannot be a durable lease fence even when the content hash is unchanged.

- `KnowledgeIndexJob.leaseToken` is a nullable unique field.
- Every claim generates a fresh Node `randomUUID()` and passes it as a parameter to the claim SQL; no database UUID extension was added.
- Completion and failure/reschedule transitions require the exact non-empty lease token in addition to the existing job, user, note, hash, and `processing` checks.
- Enqueue/upsert, manual failed-job retry, terminal stale cleanup, successful completion, reschedule, and terminal worker failure all clear the token.
- Missing-token transitions return stale/false before any database mutation, avoiding Prisma's omission of `undefined` filters.
- `attempts` remains only for retry-delay selection and maximum-attempt accounting.

### Lease RED

The reusable-attempt and schema regressions were added before production changed:

```text
$ pnpm test server/store/prismaStore.test.js server/rag/indexingWorker.test.js prisma/schema.test.js

Test Files  2 failed | 1 passed (3)
Tests       12 failed | 11 passed (23)

failed: queues create and changed-content jobs with a cleared lease
failed: resets failed jobs with a cleared lease
failed: claims with a fresh UUID lease parameter
failed: resets and reclaims the same hash at reused attempt one with a new lease
failed: rejects old-lease completion and failure at the same attempt number
failed: rejects completion and failure when no lease is present
failed: defines and migrates the unique lease token
```

The worker test file passed during RED because it already forwarded the full claimed job object; the assertions now explicitly cover the token on completion and failure calls.

### Lease GREEN

```text
$ pnpm test server/store/prismaStore.test.js server/rag/indexingWorker.test.js prisma/schema.test.js
Test Files  3 passed (3)
Tests       23 passed (23)

$ pnpm test
Test Files  20 passed (20)
Tests       96 passed (96)

$ pnpm db:generate
Generated Prisma Client (v7.8.0)
STATUS_UNCHANGED

$ pnpm lint
oxlint
exit 0

$ pnpm build
tsc -b && vite build
2032 modules transformed
built successfully
```

Live PostgreSQL/pgvector migration and lease-race integration remain deferred and are not claimed by this fix.
