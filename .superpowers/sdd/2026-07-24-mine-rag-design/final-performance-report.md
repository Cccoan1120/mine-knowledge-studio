# Final Performance Fix Report

## Status

Implemented the authorized index-status performance and control-plane rate-limit
fix from base `1a7a5be8cdb4ccaefb34fb1b36abc80a263b35c5`.

The wave is limited to:

- replacing per-poll note/job/chunk enumeration with one user-scoped aggregate
  status query;
- adding a dedicated authenticated limiter for index ensure/status/retry;
- adding strict regressions for both behaviors.

The previous nine final-review fixes remain unchanged.

## TDD evidence

### RED

Tests were changed before production code:

```text
pnpm exec vitest run server/store/prismaStore.test.js server/app.test.js
```

Observed exit code: `1`.

Observed result: `2` files failed; `2` tests failed and `43` passed.

The failures matched the missing behavior:

1. `getIndexStatus` called `note.findMany` with
   `select: { id: true, content: true }`. It also used job and chunk
   `findMany` enumeration instead of the required aggregate query.
2. After 300 authenticated index-status requests, no request returned `429`;
   there was no bounded control-plane limiter.

No production code was changed before this RED run.

### GREEN

After the minimum implementation, the exact RED command was rerun:

```text
pnpm exec vitest run server/store/prismaStore.test.js server/app.test.js
```

Observed exit code: `0`; `2` files and `45/45` tests passed.

The broader affected-area run was:

```text
pnpm exec vitest run server/store/prismaStore.test.js server/app.test.js server/security.test.js
```

Observed exit code: `0`; `3` files and `52/52` tests passed.

## Status-query design

`getIndexStatus(userId)` now issues one parameterized aggregate SQL statement
and returns one count row. It no longer:

- selects note bodies into Node;
- hashes every note body on every poll;
- fetches all index jobs into Node;
- fetches or enumerates all chunk rows in Node.

The aggregate retains the required categories:

- `pending` and `processing` come from current user-owned job states;
- `ready` requires a ready user-owned job and either whitespace-only note
  content or at least one matching current-version chunk;
- `failed` comes from current user-owned failed jobs;
- `missing` covers absent jobs and ready jobs without current searchable
  coverage.

The note query, job join, and chunk existence subquery all use the same `$1`
`userId`. The test asserts one aggregate call, literal category counts, no
model enumeration calls, and all three user-isolation predicates.

`ensureIndexJobs` remains unchanged and retains its heavier login/backfill
audit for stale hashes, missing chunks, and stale index versions.

## Control-plane limiter

Index ensure/status/retry now share a dedicated authenticated limiter:

- window: `10` minutes;
- limit: `150` requests per user;
- normal five-second polling: at least `121` requests are accepted;
- abuse remains bounded and eventually receives `429`;
- exhausting the control limiter does not consume or block the separate
  ask/analyze/generate quota.

The API regression verifies 121 successful polls, eventual control-plane
`429`, shared limiting for ensure and retry, and a successful ask afterward.

## Final verification

- Focused affected-area tests: `52/52` passed.
- Full `pnpm test`: `25` files passed and `1` skipped; `161` tests passed and
  `5` skipped.
- `pnpm lint`: exit `0`, no findings.
- `pnpm build`: exit `0`; TypeScript and Vite builds succeeded.
- Safe `pnpm test:db` after removing `MINE_RUN_DB_TESTS` and `DATABASE_URL`:
  exit `0`; `1` file and all `5` live tests explicitly skipped, with `0ms`
  test execution.
- Local fixture check:
  `fixture verified: 30 notes, 20 questions, 20/20 independent-text top-five`.
- `git diff --check`: exit `0`; only Windows line-ending conversion warnings
  were printed.

## Scope and safety review

- No `.env.local` file was read or sourced.
- No live database opt-in was enabled and no database was contacted.
- No expected-chunk-count field, schema change, or migration was added.
- No out-of-band partial-chunk corruption repair was added.
- No retrieval, citation, polling lifecycle, or prior final-fix behavior was
  reopened.
- Changes are limited to five code/test files plus this report.

## Remaining concern

The aggregate SQL shape and parameterization are covered at the mocked Prisma
boundary, but the query was not executed or performance-profiled against live
PostgreSQL. Live syntax, query-plan, index usage, and latency still require the
guarded disposable PostgreSQL/pgvector CI service. The safe local DB result is
an explicit skip, not a pass.
