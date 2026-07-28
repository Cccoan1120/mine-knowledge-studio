# Mine GPT-5.6 Terra Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Mine Chat Completions paths compatible with `gpt-5.6-terra` while preserving legacy model and embedding behavior.

**Architecture:** Add one pure request-body builder shared by the legacy AI service and RAG chat client. It applies GPT-5.6-specific parameters without changing transport, prompts, parsing, or unrelated model configuration.

**Tech Stack:** Node.js, Express, Vitest, OpenAI-compatible Chat Completions

## Global Constraints

- Keep `/chat/completions`, JSON mode, prompts, parsing, and the 60-second timeout.
- Send `reasoning_effort: "none"` and omit `temperature` for `gpt-5.6` model IDs.
- Preserve current `temperature` values for non-GPT-5.6 models.
- Keep `text-embedding-3-small` at exactly 1536 dimensions.
- Do not change Vision, Transcription, Render configuration, or call a real paid API.

---

### Task 1: Record configuration expectations

**Files:**
- Modify: `server/ai/config.test.js`
- Modify: `server/ai/config.js`
- Modify: `.env.example`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: environment variables read by `getPlatformAIConfig()` and `getEmbeddingConfig()`
- Produces: default chat model `gpt-5.6-terra`; unchanged embedding defaults

- [ ] **Step 1: Write the failing configuration test**

Add a test that clears `AI_MODEL`, expects `getPlatformAIConfig().model` to equal `gpt-5.6-terra`, and verifies `getEmbeddingConfig()` still returns `text-embedding-3-small` with 1536 dimensions.

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run server/ai/config.test.js`

Expected: FAIL because the current default chat model is `gpt-4o-mini`.

- [ ] **Step 3: Make the minimal configuration and documentation changes**

Change only the default chat model in `server/ai/config.js`, `.env.example`, and `docs/deployment.md`.

- [ ] **Step 4: Verify the configuration test passes**

Run: `pnpm vitest run server/ai/config.test.js`

Expected: PASS.

### Task 2: Add GPT-5.6 request compatibility

**Files:**
- Create: `server/ai/chatCompletionRequest.js`
- Create: `server/ai/chatCompletionRequest.test.js`
- Modify: `server/ai/service.js`
- Modify: `server/rag/questionService.js`
- Modify: `server/ai/service.test.js`
- Modify: `server/rag/questionService.test.js`

**Interfaces:**
- Consumes: `{ model, messages, temperature, jsonMode }`
- Produces: `buildChatCompletionRequest(options)` returning a Chat Completions request body

- [ ] **Step 1: Write failing request-builder tests**

Test that `gpt-5.6-terra` includes `reasoning_effort: "none"` and omits `temperature`, while `gpt-4o-mini` includes its supplied temperature and omits `reasoning_effort`.

- [ ] **Step 2: Verify the tests fail**

Run: `pnpm vitest run server/ai/chatCompletionRequest.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal pure request builder**

Return `{ model, messages, response_format? }`, then add Terra fields or legacy temperature according to the model ID.

- [ ] **Step 4: Verify the request-builder tests pass**

Run: `pnpm vitest run server/ai/chatCompletionRequest.test.js`

Expected: PASS.

- [ ] **Step 5: Write failing integration-path assertions**

In both service test files, capture the posted JSON and assert Terra-compatible fields. Also assert a configured legacy model retains its current temperature.

- [ ] **Step 6: Verify the integration-path assertions fail**

Run: `pnpm vitest run server/ai/service.test.js server/rag/questionService.test.js`

Expected: FAIL because both production paths still construct request bodies directly.

- [ ] **Step 7: Use the request builder in both production paths**

Replace only the duplicated request-body object in each path. Keep URL, headers, timeout, error handling, and response parsing unchanged.

- [ ] **Step 8: Verify all focused tests pass**

Run: `pnpm vitest run server/ai/config.test.js server/ai/chatCompletionRequest.test.js server/ai/service.test.js server/rag/questionService.test.js`

Expected: PASS.

### Task 3: Full verification and diff review

**Files:**
- Review all files changed by Tasks 1 and 2

**Interfaces:**
- Consumes: completed implementation
- Produces: verified branch ready for the user's integration decision

- [ ] **Step 1: Run static checks**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`

Expected: PASS, with database-only tests skipped unless explicitly enabled.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Run the production dependency audit**

Run: `pnpm audit --prod --no-optional`

Expected: no blocking vulnerabilities.

- [ ] **Step 5: Review scope and secrets**

Run `git diff --check`, inspect `git status --short`, and confirm no local environment file, secret, resume artifact, or unrelated change is included.
