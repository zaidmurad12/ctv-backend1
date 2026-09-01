# Provider SDK

Implements the Provider Framework for Milestone 3: the generic, reusable
abstraction layer that every future content/metadata provider (Cinemana,
TMDB, and beyond) is built on top of. Per
`specification/05-Provider-Architecture.md.txt`, Core only ever depends on
`ProviderInterface` — it never knows a concrete provider exists.

This package depends only on `@ctv-platform/domain` (for `Result`/`ok`/`err`,
`DomainError`, and the `MediaCategory` type). It never depends on
`@ctv-platform/infrastructure` — Providers are a peer of Infrastructure, not
a consumer of it, so nothing here can reach Prisma, Redis, or BullMQ even
transitively.

## Structure

```
src/
  enums.ts                        ProviderStatusEnum, ProviderCapabilityEnum, ProviderErrorCodeEnum
  errors.ts                       ProviderError, registry errors
  result.ts                       ProviderResult<T> = Result<T, ProviderError>
  metadata.ts                     ProviderMetadata (id, version, priority, capabilities, ...)
  config.ts                       ProviderConfig + createProviderConfig() (zod-validated)
  logger.ts                       ProviderLogger port (no dependency on infrastructure's Logger)
  dto.ts                          External DTOs: movie/show/season/episode/stream/subtitle/catalog/search
  queries.ts                      DiscoverQuery, SearchQuery
  health.ts                       ProviderHealth
  auth/authenticationStrategy.ts  AuthenticationStrategy port + NoopAuthenticationStrategy
  rateLimit/rateLimiter.ts        RateLimiter port + FixedWindowRateLimiter
  retry/retryPolicy.ts            RetryPolicy port + ExponentialBackoffRetryPolicy
  retry/executeWithRetry.ts       Retry executor used by AbstractProvider
  provider/providerInterface.ts   The contract every provider implements
  provider/abstractProvider.ts    Template-method base class
  registry/providerFactory.ts     ProviderFactory (lazy, DI-friendly construction)
  registry/providerRegistry.ts    ProviderRegistry (register/resolve/discover)
  registry/providerLifecycleManager.ts  Registered -> Health Check -> Available
```

## The contract

`ProviderInterface` mirrors the specification exactly: `health`, `discover`,
`search`, `movie`, `show`, `season`, `episode`, `streams`, `subtitles`, plus
`supports(capability)` for the capability system. Every method returns a
`ProviderResult<T>` — providers never throw raw HTTP/network errors; build
values with `ok`/`err` from `@ctv-platform/domain`.

## AbstractProvider

Concrete providers extend `AbstractProvider` and implement only the
protected `doHealth`/`doDiscover`/`doSearch`/`doMovie`/`doShow`/`doSeason`/
`doEpisode`/`doStreams`/`doSubtitles` primitives — the actual calls to the
external API. The base class handles, uniformly for every provider:

- **Capability gating** — calling an unsupported method (e.g. `streams()` on
  a metadata-only provider) returns `ProviderErrorCodeEnum.NOT_SUPPORTED`
  without ever invoking the concrete implementation. `health()` is exempt:
  every provider must support it per the specification.
- **Rate limiting** — a `RateLimiter` (defaults to `FixedWindowRateLimiter`,
  built from the provider's `ProviderConfig`) gates every call and is told
  about `RATE_LIMITED` responses so it can enforce a cooldown.
- **Retries** — `executeWithRetry` runs the operation through a
  `RetryPolicy` (defaults to `ExponentialBackoffRetryPolicy`, also built from
  `ProviderConfig`). `UNAUTHORIZED` failures trigger one authentication
  refresh via the provider's `AuthenticationStrategy` before the retry.
- **Logging** — every call gets a correlation id, and a start/duration/
  outcome log line through the injected `ProviderLogger`.

A metadata-only provider (e.g. TMDB) simply excludes `STREAMS`/`SUBTITLES`
from its `ProviderMetadata.capabilities` and its `doStreams`/`doSubtitles`
never run in practice.

## Registry, factory, and lifecycle

`ProviderRegistry` is the only place providers are looked up — nothing else
hardcodes a provider id. It supports both eager `register(instance)` (handy
in tests) and lazy `registerFactory({ providerId, create })` (the production
path: "providers are never instantiated manually" — the registry calls
`create()` once, on first `resolve()`, and caches the result). `list()`
returns providers sorted by ascending `priority`; `listByCapability()`
filters by what a provider actually supports.

`ProviderLifecycleManager` drives Registered → Health Check → Available: call
`initialize()` once at startup to health-check every registered provider and
capture a `ProviderLifecycleSnapshot` (status/latency/message) for each;
`refresh(id)` re-checks one provider on demand.

## Dependency injection

Nothing in this package is instantiated at import time — every class takes
its dependencies through its constructor (`ProviderConfig`, `ProviderLogger`,
optionally a `RateLimiter`/`RetryPolicy`/`AuthenticationStrategy`). Wiring a
concrete provider into the app's actual DI container (the generic
`Container` in `@ctv-platform/infrastructure`) is a composition-root concern
for the milestone that introduces the first concrete provider; this package
only needs to stay structurally compatible with that container, which it
does by construction (plain classes, no hidden singletons).

## Testing

All 44 unit tests run against fakes/injected doubles — no network calls, no
real timers beyond a few milliseconds in the retry tests (per the project's
testing rules). `tests/abstractProvider.test.mjs` exercises capability
gating, retries, rate-limit reporting, and authentication refresh together
through a minimal concrete `TestProvider`.

```bash
pnpm --filter @ctv-platform/sdk build
pnpm --filter @ctv-platform/sdk test
```
