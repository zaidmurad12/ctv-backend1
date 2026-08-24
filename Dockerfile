# Builds apps/backend (NestJS) out of the pnpm workspace. The lockfile tracks every workspace
# member (apps/admin, apps/android-tv, apps/backend, apps/web, packages/domain,
# packages/infrastructure, packages/provider-consumet, packages/sdk, services/importer) — pnpm's
# --frozen-lockfile install fails if any of those manifests are missing from the build context,
# even ones backend doesn't touch (e.g. apps/admin), so every package.json below is required.
FROM node:20-slim AS deps
WORKDIR /repo

# node:20-slim ships with no OpenSSL/libssl at all. Without it, `prisma generate` (run below,
# in the build stage) can't detect a real openssl version and silently defaults to bundling the
# debian-openssl-1.1.x query engine variant as a guess — which then fails to load at runtime
# with "libssl.so.1.1: cannot open shared object file", since no libssl of any version exists
# in either stage. Installing openssl here lets generate correctly target what's actually
# available; the runtime stage (a separate `FROM node:20-slim`, sharing no apt state with this
# one) needs the same install for the generated engine to actually load.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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

COPY prisma ./prisma
COPY packages/domain packages/domain
COPY packages/infrastructure packages/infrastructure
COPY packages/provider-consumet packages/provider-consumet
COPY packages/sdk packages/sdk
COPY services/importer services/importer
COPY apps/backend apps/backend

# Prisma CLI is a root devDependency (see package.json's db:generate script) — @prisma/client's
# generated types are needed before backend's own tsc build can compile PrismaService.
RUN pnpm db:generate
# `@ctv-platform/backend...` (dots AFTER, not before — pnpm's `...pkg` actually selects
# dependents, the opposite of what's needed here) = backend + its full dependency closure
# (domain, sdk, infrastructure, provider-consumet, importer), built in topological order via
# each package's own "build": "tsc -p tsconfig.json" — deliberately not the root
# `turbo run build`, which would also build apps/admin and apps/web (unnecessary here, and
# admin/web need their own env vars).
RUN pnpm --filter "@ctv-platform/backend..." run build

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo ./

# Render/Cloud Run inject $PORT; backendConfig.ts reads APP_PORT, so bridge the two.
ENV APP_HOST=0.0.0.0
CMD ["sh", "-c", "APP_PORT=${PORT:-3000} node apps/backend/dist/main.js"]
