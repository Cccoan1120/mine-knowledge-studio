# Mine Deployment

Mine is prepared for a single-service deployment: Express serves both `/api/*` and the built frontend from `dist/`.

## Local Neon setup

1. Create a Neon Postgres project.
2. Copy the Postgres connection string and put it in `.env.local`:

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/mine?sslmode=require"
AUTH_SECRET="replace-with-a-long-random-secret"
```

3. Generate the Prisma client and create tables:

```bash
pnpm db:generate
pnpm db:migrate
```

4. Restart the backend. If `DATABASE_URL` is present, Mine uses Postgres. Without it, Mine falls back to in-memory storage.

## Production deployment on Render

Mine's first public staging deploy should use a single Render Web Service backed by the existing Neon database. Keep this as a staging/candidate deploy until the final go-live database credential rotation is complete.

Create a private GitHub repository, push this project, then create a Render Web Service from that repository.

Render settings:

```text
Service type: Web Service
Root directory: leave empty
Language: Node
Build command: pnpm install && pnpm db:generate && pnpm build
Start command: pnpm start
Health check path: /api/health
```

### Docker runtime for media imports

The repository also includes a production `Dockerfile` with Node 24, ffmpeg, and a pinned public-media parser. After the GitHub Docker CI job passes, the existing Render service can be switched to Docker runtime without changing its service name, URL, Neon database, or environment variables.

Keep the current native Node runtime active until the Docker build is green. If Render does not allow an in-place runtime change, keep the existing service running instead of creating a second public service.

The public importer only attempts publicly accessible metadata, captions, and audio. It does not bypass private, paid, login-protected, captcha-protected, or platform-restricted content. Media downloads and transcription are limited to one task at a time and 50 MB per task.

Render should provide `PORT`. Mine listens on `0.0.0.0` in production and serves the React app from `dist/`.

Required environment variables:

```text
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host.neon.tech/mine?sslmode=require
AUTH_SECRET=replace-with-a-long-random-secret
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-5.6-terra
AI_EMBEDDING_ENABLED=true
AI_EMBEDDING_API_KEY=
AI_EMBEDDING_BASE_URL=
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
AI_VISION_API_KEY=
AI_VISION_BASE_URL=https://api.openai.com/v1
AI_VISION_MODEL=gpt-4o-mini
AI_TRANSCRIPTION_API_KEY=
AI_TRANSCRIPTION_BASE_URL=https://api.openai.com/v1
AI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
```

When `AI_EMBEDDING_API_KEY` or `AI_EMBEDDING_BASE_URL` is omitted, it defaults to the corresponding chat API credential. `AI_EMBEDDING_DIMENSIONS` must remain `1536`. `AI_EMBEDDING_ENABLED=false` explicitly overrides credential fallback.

Generate a strong `AUTH_SECRET` locally and paste only the value into Render. Do not commit it:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Deploy the retrieval migration in this order:

1. Confirm the database role can enable extensions, enable `vector` if the platform requires a separate step, and verify the extension is available.
2. Run the migration command from Render Shell or a one-off job:

```bash
pnpm db:deploy
```

3. Verify the migration created the `vector(1536)` column, simple full-text GIN index, and cosine HNSW index.
4. Release the application with the Embedding configuration.

Do not release hybrid retrieval before the extension and migrations are ready. If the initial tables already exist and the migration row is present, `pnpm db:deploy` should be safe to rerun.

Mine reports `hybrid` when Postgres and Embedding are configured, `keyword` when Postgres is active without Embedding, and `basic` for in-memory storage. Existing notes backfill asynchronously. Ready chunks remain queryable while coverage is partial.

For a non-destructive rollback, set `AI_EMBEDDING_ENABLED=false` and restart the service. Mine then stops vector queries and the indexing worker, and uses keyword retrieval over existing ready chunks without deleting them. New or edited notes remain queued until `AI_EMBEDDING_ENABLED=true` is restored.

Operational events contain only fixed event/outcome/failure categories, durations, retrieval mode, and candidate/context/job counts. Logs must never contain questions, rewritten questions, note or chunk content, quotes, citation text, API keys, provider errors, or database connection strings.

Before a formal production launch, rotate the Neon database password once, then update Render's `DATABASE_URL` to the rotated value. Do not store the real connection string in this repository.

## Pre-deploy local validation

```bash
pnpm lint
pnpm test
pnpm build
```

Live database tests belong only on a verified disposable pgvector database:

```bash
MINE_RUN_DB_TESTS=1 pnpm test:db
```

Without both the opt-in flag and `DATABASE_URL`, the suite skips and does not connect.

Also confirm that `.env.local`, real API keys, logs, build output, and local screenshots are not staged for commit.

## Smoke test

After deployment:

1. Open `/api/health` and confirm it returns `{ "ok": true }`.
2. Open the root URL and confirm the Mine login page loads.
3. Register a user, create one note, restart the service, and confirm the note is still available.
4. Register a second user and confirm the first user's notes are not visible.
5. Create a note with a unique Chinese/English phrase and confirm it becomes searchable within 60 seconds.
6. Edit that note with a different unique phrase and confirm the new phrase becomes searchable within 60 seconds while the old phrase no longer returns the replaced chunk.
