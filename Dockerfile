# syntax=docker/dockerfile:1
# Saqina's production image for the VPS (docs/adr/0028-host-on-a-vps-with-docker.md).
# The same image runs as `web` (node server.js) and as `scheduler` (node scripts/scheduler.mjs).

FROM node:24-slim AS deps
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Next writes NEXT_PUBLIC_ values into the bundles at build time; setting them on the server later
# changes nothing. image.yml passes them from the repository's variables.
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
# The public /services pages are prerendered from the database, as on Vercel, so the build reads
# DATABASE_URL from a build secret. It is not kept in any layer. A read-only role is enough.
RUN --mount=type=secret,id=database_url,env=DATABASE_URL pnpm build
# One file with every dependency, so migrations run from the slim image.
RUN node_modules/.bin/esbuild scripts/migrate.ts --bundle --platform=node --format=esm --target=node24 \
      --external:pg-native --outfile=dist/migrate.mjs \
      --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"

FROM node:24-slim AS run
WORKDIR /app
ARG GIT_COMMIT_SHA=""
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GIT_COMMIT_SHA=$GIT_COMMIT_SHA
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/public ./public
# Read from disk at request time: the user guides and their screenshots.
COPY --from=build --chown=node:node /src/src/content ./src/content
# migrate.mjs reads ./src/lib/db/migrations from the working directory.
COPY --from=build --chown=node:node /src/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=build --chown=node:node /src/dist/migrate.mjs ./migrate.mjs
COPY --from=build --chown=node:node /src/scripts/scheduler.mjs ./scripts/scheduler.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
