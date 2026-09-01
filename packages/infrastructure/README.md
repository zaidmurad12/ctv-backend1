# Infrastructure Package

Implements the Infrastructure Layer for Milestone 2. This package is the only
place in the platform allowed to talk to Postgres (via Prisma), Redis, and
BullMQ. It depends on `@ctv-platform/domain` and implements the domain's
repository interfaces; the domain package never depends back on this one.

## Structure

```
src/
  config/       Environment loading and validation (zod)
  di/           Generic DI container, service tokens, composition root
  logging/      Logger contract + console implementation
  prisma/
    client.ts        PrismaClient factory (pool/timeout/logging from config)
    mappers/          Prisma row <-> domain aggregate translation
    repositories/     Domain repository interfaces implemented with Prisma
    unitOfWork.ts     Transactional repository bundle
  redis/        Redis connection factory + cache client
  queue/        Queue client contract, in-memory and BullMQ implementations
  health/       Health check contracts + database/redis checks
```

## Configuration

All values are read from the environment via `createAppConfig()` and validated
with zod (see `specification/18-Configuration-Reference.md.txt`). Every value
has a documented default that matches `.env.example` and the local
`docker-compose.yml` stack; unknown or malformed values fail fast at startup.

| Group    | Variables                                                               |
| -------- | ----------------------------------------------------------------------- |
| Database | `DATABASE_URL`, `DATABASE_POOL`, `DATABASE_TIMEOUT`, `DATABASE_LOGGING` |
| Redis    | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`                |
| Queue    | `QUEUE_PREFIX`, `QUEUE_CONCURRENCY`, `QUEUE_RETRY`, `QUEUE_TIMEOUT`     |
| Logging  | `LOG_LEVEL`                                                             |

## Mapping layer

Domain aggregates (`Movie`, `TVShow`, `Season`, `Episode`) are intentionally
narrower than the Prisma schema. Each `*Mapper` class is the single place that
knows both shapes:

- `toDomain(row)` rehydrates an aggregate via the entity's `reconstitute()`
  factory (preserves persisted status/timestamps, unlike `create()` which is
  for brand-new entities).
- `toCreateInput(entity)` / `toUpdateInput(entity)` produce Prisma write
  payloads.

**Known schema gap:** the `Episode` table has no `status` column — episode
availability is expressed through its `Stream` rows instead. `EpisodeMapper`
treats every persisted row as `published`; this is documented in the mapper
itself rather than hidden.

## Repositories & UnitOfWork

`PrismaMovieRepository` / `PrismaTVShowRepository` filter out soft-deleted
rows (`deletedAt: null`); `Season`/`Episode` have no soft-delete column in the
schema, so their repositories query directly. `save()` is an upsert keyed on
`id`, matching the domain's single `save()` method (no separate create/update
in the repository interfaces).

`PrismaUnitOfWork.execute(callback)` runs inside a single Prisma
`$transaction` and hands the callback repository instances bound to the
transactional client, so multi-aggregate writes commit or roll back together.

## Dependency injection

`registerInfrastructure(container, config)` (or the convenience
`createInfrastructureContainer(config)`) wires every service — Prisma client,
Redis connection, repositories, unit of work, cache client, health checker —
as singletons on the generic `Container`, keyed by the string constants in
`INFRA_TOKENS`. Nothing is instantiated manually outside this composition
root.

## Testing

Unit tests (`node --test`) cover mappers, repositories (against a hand-rolled
fake Prisma client), the unit of work, the DI container and composition root,
the in-memory queue/cache, and the health checks — all without a network call,
per the project's testing rules. `RedisCacheClient` and the health checks are
exercised against duck-typed fakes of the Redis/Prisma surface they use.

`BullMQQueueClient` is not unit tested: it owns real `bullmq` `Queue`/`Worker`
instances and its correctness is an integration concern (requires a live
Redis). Exercise it with the `docker-compose.yml` stack running.

```bash
pnpm --filter @ctv-platform/infrastructure build
pnpm --filter @ctv-platform/infrastructure test
```

## Regenerating the Prisma client

The schema lives at `prisma/schema.prisma` (repo root). After changing it, run:

```bash
pnpm db:generate
```
