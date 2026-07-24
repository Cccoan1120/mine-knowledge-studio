# Task 1 Report: Pure RAG Retrieval Core

## Scope

Added six pure ESM modules under `server/rag/`:

- `chunker.js`: Markdown AST chunking with heading paths, source offsets, token windows, overlap, and no empty chunks.
- `hash.js`: deterministic SHA-256 content hashing.
- `searchTokens.js`: lowercase English terms and Chinese character bigrams.
- `rrf.js`: reciprocal rank fusion with default `k = 60` and stable ties.
- `context.js`: ranked context selection bounded to 8 chunks, 5 notes, and 2 chunks per note.
- `fallbackQuery.js`: standalone query construction from the current question and the most recent six history messages, keeping user messages only.

`unified` and `remark-parse` are direct runtime dependencies for source-positioned Markdown AST parsing. No routes, stores, Prisma schema, or UI files changed.

## RED Evidence

Each production module was created only after its associated test failed because the module did not exist. The following are actual output excerpts:

| Command | Actual RED output excerpt |
| --- | --- |
| `pnpm test server/rag/hash.test.js` | `Error: Failed to resolve import "./hash.js" from "server/rag/hash.test.js". Does the file exist?` |
| `pnpm test server/rag/searchTokens.test.js` | `Error: Failed to resolve import "./searchTokens.js" from "server/rag/searchTokens.test.js". Does the file exist?` |
| `pnpm test server/rag/rrf.test.js` | `Error: Failed to resolve import "./rrf.js" from "server/rag/rrf.test.js". Does the file exist?` |
| `pnpm test server/rag/context.test.js` | `Error: Failed to resolve import "./context.js" from "server/rag/context.test.js". Does the file exist?` |
| `pnpm test server/rag/fallbackQuery.test.js` | `Error: Failed to resolve import "./fallbackQuery.js" from "server/rag/fallbackQuery.test.js". Does the file exist?` |
| `pnpm test server/rag/chunker.test.js` | `Error: Failed to resolve import "./chunker.js" from "server/rag/chunker.test.js". Does the file exist?` |
| `pnpm test server/rag/chunker.test.js` | `+   "one two three four five six seven eight nine ten",` |

The hash fixture was independently checked with Node's SHA-256 implementation before the minimal hash module was written.

## GREEN Evidence

Focused module tests passed after each implementation. The final focused run was:

```text
$ pnpm test server/rag
Test Files  6 passed (6)
Tests  8 passed (8)
```

The required full suite run was:

```text
$ pnpm test
Test Files  14 passed (14)
Tests  59 passed (59)
```

## Coverage

- Heading breadcrumb, source offsets, small-limit splitting, overlap, hard-cap behavior, and no empty chunks: `server/rag/chunker.test.js`.
- Deterministic SHA-256: `server/rag/hash.test.js`.
- English normalization and Chinese bigrams: `server/rag/searchTokens.test.js`.
- RRF ordering and stable equal-score ties: `server/rag/rrf.test.js`.
- Context diversity limits: `server/rag/context.test.js`.
- Exclusion of assistant content and last-six-message boundary: `server/rag/fallbackQuery.test.js`.

## Self-Review

- Verified the public defaults: target 700 tokens, hard maximum 1000, overlap 100.
- Confirmed all chunk fields required by the task are returned: `ordinal`, `headingPath`, `content`, `startOffset`, `endOffset`, and `tokenCount`.
- Confirmed `git diff --check` reports no whitespace errors.
- Confirmed the diff contains only the Task 1 RAG modules/tests, the two parser dependency declarations, lockfile updates, and this report.

## Review Fix Cycle Evidence

The following tests were added before the reviewed chunker behavior changed: Unicode content preservation, punctuation-only oversized splitting, and skipped heading-level normalization.

### RED

```text
$ pnpm test server/rag/chunker.test.js
Test Files  1 failed (1)
Tests  3 failed | 3 passed (6)
× preserves non-ASCII content in chunks
× splits oversized punctuation-only blocks within the hard maximum
× does not leave sparse entries for skipped heading levels
+     "content": "café",
+ []
+   undefined,
```

```text
$ pnpm test server/rag/chunker.test.js
Test Files  1 failed (1)
Tests  1 failed | 6 passed (7)
× does not hide oversized punctuation tails behind a word token
+   "word!!!!!!!",
```

### GREEN

```text
$ pnpm test server/rag/chunker.test.js
Test Files  1 passed (1)
Tests  6 passed (6)

$ pnpm test
Test Files  14 passed (14)
Tests  62 passed (62)

$ pnpm test server/rag/chunker.test.js
Test Files  1 passed (1)
Tests  7 passed (7)

$ pnpm test
Test Files  14 passed (14)
Tests  63 passed (63)
```
