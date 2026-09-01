# Builds and serves apps/admin (Next.js, pages router) as its own standalone Cloud Run service -
# separate from the backend's own Dockerfile (D:\CTV-Platform\Dockerfile), since this is a
# different runtime (Next's own server, not Nest's) with different build-time needs (see the
# NEXT_PUBLIC_API_BASE_URL build arg below).
#
# The lockfile tracks every workspace member - pnpm's --frozen-lockfile install fails if any of
# their manifests are missing from the build context, even ones this app doesn't itself import,
# so every package.json below is required (same reasoning as the backend's own Dockerfile).
FROM node:20-slim AS deps
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/android-tv/package.json apps/android-tv/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/infrastructure/package.json packages/infrastructure/package.json
COPY packages/provider-consumet/package.json packages/provider-consumet/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY services/importer/package.json services/importer/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo

COPY apps/admin apps/admin

# NEXT_PUBLIC_* variables are inlined into the client bundle at build time, not read at runtime -
# setting this as a plain Cloud Run *runtime* env var on the deployed service would do nothing;
# it has to be present right here, before `next build` runs. Same deployed backend URL every
# other client in this project already points at (see adminMoviesRepository.ts's own
# PUBLIC_API_BASE_URL constant) - update this line (and rebuild) if that URL ever changes.
ENV NEXT_PUBLIC_API_BASE_URL=https://ctv-platform-backend-188952464622.me-central1.run.app/api/v1

RUN pnpm --filter @ctv-platform/admin run build

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# next.config.mjs sets distDir: 'dist' (not the framework default .next/), so the standalone
# server and static assets land under apps/admin/dist/ instead of the usual .next/ paths - every
# copy below has to match that.
COPY --from=build /repo/apps/admin/dist/standalone ./
COPY --from=build /repo/apps/admin/dist/static ./apps/admin/dist/static

# Render/Cloud Run inject $PORT; Next's own server reads PORT directly.
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "PORT=${PORT:-3001} node apps/admin/server.js"]
