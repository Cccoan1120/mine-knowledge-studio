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

Render should provide `PORT`. Mine listens on `0.0.0.0` in production and serves the React app from `dist/`.

Required environment variables:

```text
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host.neon.tech/mine?sslmode=require
AUTH_SECRET=replace-with-a-long-random-secret
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_VISION_API_KEY=
AI_VISION_BASE_URL=https://api.openai.com/v1
AI_VISION_MODEL=gpt-4o-mini
AI_TRANSCRIPTION_API_KEY=
AI_TRANSCRIPTION_BASE_URL=https://api.openai.com/v1
AI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
```

Generate a strong `AUTH_SECRET` locally and paste only the value into Render. Do not commit it:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run the migration command once after the first deploy, using Render Shell or a one-off job:

```bash
pnpm db:deploy
```

If the initial tables already exist and the migration row is present, `pnpm db:deploy` should be safe to rerun.

Before a formal production launch, rotate the Neon database password once, then update Render's `DATABASE_URL` to the rotated value. Do not store the real connection string in this repository.

## Pre-deploy local validation

```bash
pnpm lint
pnpm test
pnpm build
```

Also confirm that `.env.local`, real API keys, logs, build output, and local screenshots are not staged for commit.

## Smoke test

After deployment:

1. Open `/api/health` and confirm it returns `{ "ok": true }`.
2. Open the root URL and confirm the Mine login page loads.
3. Register a user, create one note, restart the service, and confirm the note is still available.
4. Register a second user and confirm the first user's notes are not visible.
