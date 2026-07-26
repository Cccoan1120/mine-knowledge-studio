# Final Fix Report

## Status

All five Important and four Minor findings from `final-review.md` were
implemented on `codex/mine-hybrid-rag` from the required starting commit
`ad6bb3599324b1d5125d9378e1b1d346c809fdc5`.

The changes are limited to the reviewed indexing, retrieval, index-status,
client lifecycle, offline fallback, disposable-database guard, CI database
name, and regression-test paths.

## Finding-by-finding TDD evidence

### Important 1: stale chunks after note edits

Production behavior:

- Dense and keyword retrieval now require matching chunk/note ownership,
  a ready current index job, the current note content hash, and the current
  index version.
- Returned candidates therefore cannot become final citations while reindexing
  is pending or failed.

RED:

```text
pnpm exec vitest run server/store/prismaStore.test.js server/store/memoryStore.test.js server/rag/questionService.test.js server/app.test.js src/services/aiService.test.ts
```

Observed exit code `1`: `11` tests failed and `56` passed. The new retrieval
regressions showed that the dense and keyword SQL did not join the current note
and ready index job, so pending/failed and stale-version chunks remained
eligible.

GREEN:

The same five-file command exited `0`: `5` files and `67/67` tests passed.
The final combined focused command also exited `0`: `9` files and `95/95`
tests passed.

### Important 2: basic polling, retry backoff, and rate quota

Production behavior:

- Basic storage reports non-empty notes as immediately searchable and does not
  advertise permanently missing index coverage.
- Client polling stops for basic mode.
- Recoverable polling delays are `5s`, `10s`, `20s`, then `30s` maximum.
- Index ensure/status/retry remain authenticated but do not consume the
  ask/analyze/generate rate quota.

RED:

```text
pnpm exec vitest run server/store/prismaStore.test.js server/store/memoryStore.test.js server/rag/questionService.test.js server/app.test.js src/services/aiService.test.ts
```

Observed exit code `1`: `11` failed and `56` passed. Basic status still
reported one missing note and repeated status polling exhausted the shared AI
quota.

```text
pnpm exec vitest run src/App.test.ts
```

Observed exit code `1`: all `5` new lifecycle tests failed. Basic mode kept
polling and a rejected status request did not schedule a bounded recovery.

GREEN:

The server/store/client command passed `67/67`; the App command passed
`10/10`; the final combined focused command passed `95/95`.

### Important 3: refresh after material mutations

Production behavior:

- Successful create, content edit, Markdown import, local-vault import,
  external import, local migration, and delete restart index-status refresh
  immediately.
- Metadata-only autosaves do not restart polling.

RED:

```text
pnpm exec vitest run src/App.test.ts
```

Observed exit code `1`: all `5` new lifecycle tests failed. Create, import,
delete, and content-edit paths did not refresh status after initial polling had
settled.

GREEN:

The App command passed `10/10`; the final combined focused command passed
`95/95`.

### Important 4: hard disposable-database guard

Production behavior:

- A live test URL must name a database containing a standalone `test` token
  separated by the start/end of the name, `_`, or `-`.
- Unsafe or malformed URLs abort before a Prisma client is created.
- A test-named database containing non-test users or jobs aborts before any
  worker or mutation work.
- The CI service database is named `mine_ci_test`.

RED:

```text
pnpm exec vitest run tests/databaseGuard.test.js
```

The initial guard-entry regression exited `1` with `1` failed test because no
guard module existed. After adding the entry point, the behavior RED run
exited `1` with `3` failed and `1` passed: unsafe identity/data cases were
still not rejected before client or database work.

GREEN:

After removing the temporary scaffolding assertion, the focused guard command
exited `0`: `3/3` tests passed. The final combined focused command passed
`95/95`.

### Important 5: actual current chunk coverage

Production behavior:

- `ensureIndexJobs` now evaluates notes, jobs, and chunks together.
- Non-empty notes are requeued for absent chunks, incomplete current-hash
  coverage, or stale index versions.
- Whitespace-only content requires no chunks.
- Status counts ready coverage only when the current job and chunks are
  searchable.
- The locked transactional recheck prevents stale backfill observations from
  overwriting a newer pending job.

RED:

```text
pnpm exec vitest run server/store/prismaStore.test.js server/store/memoryStore.test.js server/rag/questionService.test.js server/app.test.js src/services/aiService.test.ts
```

Observed exit code `1`: `11` failed and `56` passed. Hash-only job checks did
not detect absent/incomplete/stale-version chunks, and status did not reflect
actual searchable coverage.

During self-review, the added transaction-race regression was also run RED and
exited `1` with `1` failed and `18` passed because the locked job selection
omitted `noteId`. Selecting `noteId` fixed the recheck without broadening the
change.

GREEN:

The five-file command passed `67/67`; the final combined focused command passed
`95/95`.

### Minor 1: clear unsent question draft on sign-out

RED:

```text
pnpm exec vitest run src/App.test.ts
```

Observed exit code `1`: the cross-account reset regression retained the prior
account's unsent question draft.

GREEN:

The App command passed `10/10`; the final combined focused command passed
`95/95`.

### Minor 2: truthful retrieval-mode reporting

Production behavior:

- A query with an embedding but no search tokens reports `dense`.
- Explicitly disabled embeddings report index status as `keyword` on
  PostgreSQL storage.

RED:

The five-file server/store/client RED command above included the dense-only
regression and contributed to its `11` failures. The explicit-disable status
regression was then run separately:

```text
pnpm exec vitest run server/app.test.js
```

Observed exit code `1`: `1` failed and `23` passed because status reported
`basic` instead of `keyword`.

GREEN:

The final combined focused command passed `95/95`.

### Minor 3: empty model knowledge answer is insufficient

RED:

The five-file server/store/client command exited `1` with `11` failed and
`56` passed. The new regression received an evidence-insufficient fallback
sentence while `insufficient` remained false.

GREEN:

The command passed `67/67`; the final combined focused command passed `95/95`.

### Minor 4: offline fallback scope filters

Production behavior:

- Local fallback applies note, topic, and tag filters with AND semantics across
  filter groups and OR semantics within each group, matching the server.

RED:

The five-file server/store/client command exited `1` with `11` failed and
`56` passed. Offline fallback ignored topic/tag scope and searched the full
note list.

GREEN:

The command passed `67/67`; the final combined focused command passed `95/95`.

## Final focused verification

```text
pnpm exec vitest run server/store/prismaStore.test.js server/store/memoryStore.test.js server/rag/questionService.test.js server/app.test.js server/ai/config.test.js src/App.test.ts src/services/aiService.test.ts src/components/AssistantPanel.test.tsx tests/databaseGuard.test.js
```

Observed exit code `0`: `9` files and `95/95` tests passed.

## Final repository verification

- Full `pnpm test`: `25` files passed and `1` skipped; `159` tests passed and
  `5` skipped.
- `pnpm lint`: exit `0`, no findings.
- `pnpm build`: exit `0`; TypeScript and Vite builds succeeded.
- Safe `pnpm test:db` after removing `MINE_RUN_DB_TESTS` and `DATABASE_URL`:
  exit `0`; `1` file and all `5` live tests explicitly skipped with `0ms` test
  execution.
- Local fixture structural/ranking check:
  `fixture verified: 30 notes, 20 questions, 20/20 independent-text top-five`.
- `git diff --check`: exit `0`; only Windows line-ending conversion warnings
  were printed.

## Safety and self-review

- The main workspace `.env.local` was not read or sourced.
- No live database opt-in was enabled and no existing database was contacted.
- The database guard rejects unsafe identity before client creation and
  rejects non-test users/jobs before worker or mutation work.
- Every production change maps directly to a final-review finding.
- No unrelated refactor or cleanup was included.
- The focused, full, lint, build, safe-skip database, fixture, and diff checks
  are recorded separately so skipped live coverage is not represented as
  passing.

## Remaining concern

Live PostgreSQL/pgvector verification remains unrun locally. The five live
tests, migrations, real vector/keyword retrieval, concurrency behavior, and
fixture threshold still require a verified disposable database such as the
guarded CI service. Local fixture success is not a substitute for that live
verification.
