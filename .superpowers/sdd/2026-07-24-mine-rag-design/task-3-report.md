# Task 3 Report: Hybrid RAG question service and API

## Status

Implemented the server-side hybrid RAG question flow, validated request contract, user-isolated Prisma retrieval SQL, authenticated indexing APIs, auth-triggered index ensuring, capability reporting, and indexing worker runtime lifecycle.

No React UI or client TypeScript files were changed.

## Assumptions

- `storageMode: 'memory' | 'postgres'` is the store-level discriminator for basic versus indexed retrieval and worker startup.
- Index API responses use `{ queued, status }`, `{ status }`, and `{ retried, status }`; these preserve the existing Task 2 aggregate status object.
- Memory mode preserves the approved note-level answer behavior and its note-level citations because no chunk IDs exist in that mode.
- Live pgvector execution is intentionally deferred to Task 5; this task verifies the SQL and parameters at the Prisma store boundary.

## RED Evidence

Command:

```text
pnpm vitest run server/rag/questionService.test.js server/store/prismaStore.test.js server/app.test.js server/ai/config.test.js server/runtime.test.js
```

Initial result:

```text
Exit code: 1
Test Files  5 failed (5)
Tests       17 failed | 35 passed (52)
Duration    17.65s
```

The failures were the intended missing behaviors:

- invalid history and scope returned HTTP 200 instead of 400;
- effective scope and legacy precedence were absent;
- index ensure/status/retry routes returned API 404;
- register/login did not call `ensureIndexJobs`;
- capability `retrievalMode` was absent;
- Prisma had no candidate retrieval method;
- the RAG question service entrypoint threw its explicit not-implemented error;
- the runtime lifecycle entrypoint threw its explicit not-implemented error.

The test run reached behavior assertions rather than failing on missing imports or test setup.

## GREEN Evidence

Focused command:

```text
pnpm vitest run server/rag/questionService.test.js server/store/prismaStore.test.js server/app.test.js server/ai/config.test.js server/runtime.test.js
```

Final focused result:

```text
Exit code: 0
Test Files  5 passed (5)
Tests       52 passed (52)
Duration    18.53s
```

Covered behaviors:

- request, history, and scope validation, including limits, uniqueness, roles, and legacy precedence;
- dense and keyword SQL ownership constraints plus parameterized note/topic/tag filters;
- dense/keyword RRF ordering and context limits of 8 chunks, 5 notes, and 2 chunks per note;
- keyword fallback without provider-error exposure when query embedding fails;
- multi-turn rewrite success and the approved standalone-query fallback;
- untrusted source wrapping and explicit prompt instructions;
- citation chunk/note/quote verification, quote limit, and trusted metadata enrichment;
- forced insufficiency when citations are invalid and general-supplement suppression when evidence is sufficient;
- memory/basic note filtering with AND-across and OR-within scope semantics;
- authenticated index ensure/status/retry and user-isolated status;
- non-blocking register/login index ensuring;
- capability retrieval modes;
- shared-store worker start/stop behavior and normal signal shutdown.

## Full Verification

```text
pnpm test
Exit code: 0
Test Files  22 passed (22)
Tests       113 passed (113)

pnpm lint
Exit code: 0
Output: $ oxlint

pnpm build
Exit code: 0
TypeScript build and Vite production build succeeded.

git diff --check
Exit code: 0
No whitespace errors. Git emitted only the repository's Windows LF-to-CRLF notices.
```

## Self-Review

- Confirmed all dense and keyword queries bind the authenticated user as `$1`, constrain both `KnowledgeChunk` and joined `Note`, and bind all user-controlled filter values as parameters.
- Confirmed results omit rewritten queries, embeddings, scores, prompts, provider errors, API keys, and connection strings.
- Confirmed model citations are rebuilt from trusted retrieved metadata only after exact chunk/note/quote validation.
- Confirmed auth-triggered index failures log only the fixed message `Knowledge indexing ensure failed.`
- Confirmed memory mode and missing embedding configuration do not start the indexing worker.
- Confirmed the worker receives the exact store instance mounted in Express and stops once on server close or normal termination signals.
- Confirmed the diff is scoped to Task 3 server code, server tests, and this report.

## Concern

The Prisma retrieval SQL is unit-tested through captured query text and bound parameters, but it has not been executed against a live PostgreSQL/pgvector database. That integration gap is explicitly reserved for Task 5.
