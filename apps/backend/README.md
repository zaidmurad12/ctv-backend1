# @ctv-platform/backend

Production REST API for the CTV Platform (Milestone 5), built with NestJS.
Depends on `@ctv-platform/domain`, `@ctv-platform/infrastructure`,
`@ctv-platform/sdk`, and `@ctv-platform/importer` — every route reaches
persistence and business rules only through a use case, never directly
through Prisma.

See `specification/09-Backend-API.md.txt` and `specification/24-AI-Memory.md.txt`
(Milestone 5 Update) for the full requirements and implementation notes.

## Running

```bash
pnpm --filter @ctv-platform/backend build
pnpm --filter @ctv-platform/backend start
# or, for a watch-mode rebuild:
pnpm --filter @ctv-platform/backend dev
```

Requires `DATABASE_URL`, `REDIS_*`, `JWT_SECRET`, `JWT_REFRESH_SECRET`
(see `.env.example` at the repo root) and a running PostgreSQL + Redis
(`docker-compose.yml`). The server listens on `PORT` (default `3000`) under
the `API_PREFIX` (default `/api/v1`).

Swagger/OpenAPI documentation is served at `/api/v1/docs` when
`SWAGGER_ENABLED=true`.

## Database seed (bootstrap administrator)

A fresh database has no users at all, so there is no way to sign into
`apps/admin` (or call any `/admin/*` endpoint) until one is created. Run
the Prisma seed once against a freshly migrated database:

```bash
pnpm db:generate
pnpm db:seed
# equivalent: pnpm prisma db seed
```

This creates the three fixed roles (`ADMIN`, `EDITOR`, `VIEWER` — see
`UserRoleEnum` in `prisma/schema.prisma`) and one Administrator account:

| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@ctv.local` |
| Password | `Admin@123`       |
| Role     | `ADMIN`           |

**Change this password immediately in any non-local environment** — it is
a well-known bootstrap default, not a secret. There is no admin
reset-password endpoint yet (only self-service `PATCH /users/me/password`
via `src/users/`), so change it either by logging in as `admin@ctv.local`
and calling that endpoint, or by re-hashing and updating the row directly.

The seed (`prisma/seed.mjs` at the repo root, wired up via the `"prisma.seed"`
field in the root `package.json` per Prisma's `db seed` convention) hashes
the password with the same `bcrypt` library, algorithm, and
`BCRYPT_SALT_ROUNDS` config (default `12`) as this package's real
`BcryptPasswordHasher` (`src/auth/infrastructure/authServices.ts`), so the
seeded account logs in through the normal `POST /auth/login` endpoint —
there is no seed-specific auth path. Every write is an `upsert` keyed on a
unique column (`Role.name`, `User.email`), so running the seed again is
always safe: it will not duplicate roles or the admin user, and will not
overwrite the password if it has since been changed through the app.

## API surface

All responses use the standard envelope:
`{success:true, data, meta}` on success, `{success:false, error:{code,message,details}}`
on failure.

- **Auth** (`/auth`) — register, login, refresh, logout, profile. JWT access
  tokens (short-lived, HS256) + rotating opaque refresh tokens (hashed at
  rest, revoked on use).
- **Users** (`/users`) — self profile update, password change.
- **Catalog** (`/movies`, `/shows`, `/seasons`, `/episodes`) — list/sort/
  paginate, details, streams, subtitles.
- **Search** (`/search`) — title search and typeahead suggestions.
- **Favorites** (`/favorites`) — add/remove/list.
- **Watch History** (`/watch-history`) — record/list/clear.
- **Continue Watching** (`/continue-watching`) — upsert/list.
- **Admin** (`/admin`, ADMIN role only) — user management, dashboard
  statistics, provider registry inspection.
- **Health** (`/health`) — public, reports database/Redis health.

Every endpoint is validated with `class-validator` DTOs and rate-limited
per `specification/12-Security.md.txt`.

## Architecture notes

- **Query repositories**: Milestone 1's domain repositories are
  write-oriented and too narrow for flexible pagination/sort/filter, so
  Catalog and Search use new, local, read-only query repositories
  (`src/catalog/infrastructure`, `src/search/infrastructure`) instead of
  widening the domain repositories.
- **Locally modeled concepts**: `User`, `Favorite`, `WatchHistory`,
  `ContinueWatching`, and the auth `RefreshToken` have no domain aggregate
  (out of Milestone 1's scope) and are modeled directly in this package,
  reusing domain's generic base classes (`EntityBase`, `DomainError`, etc.),
  following the same precedent set for `Stream`/`Subtitle`/`Image`/`Provider`
  in `services/importer`.
- **No concrete provider**: the Admin "providers" endpoints are wired to a
  real but empty `ProviderRegistry`/`DiscoveryEngine`/`ProviderLifecycleManager`
  (from `@ctv-platform/sdk` / `@ctv-platform/importer`). They correctly
  return empty lists — no Cinemana or other provider integration exists or
  is authorized (see the Milestone 5 Update in AI Memory for why).

### NestJS DI and DTO binding vs. `import type`

Do **not** apply the repo's `@typescript-eslint/consistent-type-imports`
rule to this package. NestJS's implicit (non-`@Inject`) constructor
injection and `ValidationPipe`'s DTO binding both depend on
`emitDecoratorMetadata` capturing the real class at runtime — for
constructor parameters (to resolve the right provider) and for `@Body()`/
`@Query()` parameters (so the pipe knows which class to instantiate before
validating). An `import type` erases the class from emitted JS, which
breaks DI loudly (`UnknownDependenciesException` at bootstrap) but breaks
DTO binding silently (whitelist strips every property, yielding a
confusing 400). The rule is disabled for `apps/backend/**/*.ts` in the
root `eslint.config.mjs` for this reason. Keep concrete classes and
`@Body()`/`@Query()` DTO types as regular value imports; interfaces bound
via `@Inject(TOKEN)` and pure return-type annotations may stay `import type`.

## Testing

```bash
pnpm --filter @ctv-platform/backend test
```

- **Unit tests** (`tests/*.useCases.test.mjs`) exercise use cases against
  fake repositories.
- **Integration tests** (`tests/app.integration.test.mjs`) run `supertest`
  against a real Nest app built via `Test.createTestingModule`, overriding
  only `PrismaService`/`USER_REPOSITORY`/`REFRESH_TOKEN_REPOSITORY`/
  `FavoriteRepository` — every guard, pipe, filter, and interceptor runs for
  real.

Uses `node --test`, consistent with every other package in this monorepo.

## Known scope boundaries

- No concrete provider (Cinemana/TMDB) is implemented or registered.
- Genres, Collections, People (cast/crew), Recommendations, Settings
  management, Metrics/analytics, and the full 9-queue Sync API surface
  named elsewhere in the spec set are not implemented — none have a domain
  aggregate, consistent with the same gap documented for
  `services/importer` in Milestone 4.
- Search is a straightforward Postgres/Prisma title match; no dedicated
  search infrastructure exists yet (Milestone 8 scope).
- The Prisma seed only bootstraps the three roles and one Administrator
  account (see "Database seed" above) — it is not a general fixture/demo
  data seed for movies, shows, or other content.
