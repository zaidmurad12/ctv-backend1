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
ENV NEXT_PUBLIC_API_BASE_URL=https://ctv-platform-api.onrender.com/api/v1
RUN pnpm --filter @ctv-platform/admin run build

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/apps/admin/dist/standalone ./
COPY --from=build /repo/apps/admin/dist/static ./apps/admin/dist/static
ENV HOSTNAME=0.0.0.0
CMD ["sh", "-c", "PORT=${PORT:-3001} node apps/admin/server.js"]
