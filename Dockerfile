FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack install --global pnpm@10.34.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm db:generate && pnpm build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && python3 -m pip install --no-cache-dir --break-system-packages yt-dlp==2026.6.9 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack install --global pnpm@10.34.5

COPY --from=build --chown=node:node /app /app

USER node
EXPOSE 10000
CMD ["pnpm", "start"]
