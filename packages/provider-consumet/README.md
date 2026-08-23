# @ctv-platform/provider-consumet

A concrete `ProviderInterface` implementation (see `@ctv-platform/sdk`) backed by a
self-hosted [Consumet](https://github.com/consumet/consumet.org) REST API instance.
It supplies **streams, subtitles, and lightweight discovery/search** for movies and
TV shows — it never supplies descriptive metadata (title/overview/artwork), so it can
never override TMDB or any other metadata-enrichment provider.

## Legal note

Consumet's own content providers (FlixHQ, SFlix, DramaCool, etc.) work by scraping
unauthorized streaming sites; its scraper source has been subject to takedown action
on GitHub. This package treats Consumet purely as a black-box HTTP API — it contains
no scraper code of its own — and expects `PROVIDER_CONSUMET_BASE_URL` to point at a
Consumet API instance you run and are responsible for. Enabling this provider is a
deliberate choice made by whoever deploys this platform, not a default.

## Configuration

All env vars are read once, in `src/config.ts`, by the host application:

| Variable                              | Default                 | Purpose                                                                                                       |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PROVIDER_CONSUMET_ENABLED`           | `false`                 | Master on/off switch. When `false`, the host app never registers this provider — no network calls, no errors. |
| `PROVIDER_CONSUMET_BASE_URL`          | `http://localhost:4000` | Base URL of your self-hosted Consumet API instance.                                                           |
| `PROVIDER_CONSUMET_SOURCE`            | `flixhq`                | Which Consumet movies source to target (e.g. `flixhq`, `dramacool`, `sflix`).                                 |
| `PROVIDER_CONSUMET_PRIORITY`          | `50`                    | Lower number = higher priority among registered providers.                                                    |
| `PROVIDER_CONSUMET_TIMEOUT_MS`        | `15000`                 | Per-request timeout.                                                                                          |
| `PROVIDER_CONSUMET_MAX_RPS`           | `5`                     | Requests/second cap enforced by the SDK's rate limiter.                                                       |
| `PROVIDER_CONSUMET_CACHE_TTL_SECONDS` | `21600`                 | How long raw HTTP responses are cached in-process.                                                            |

## Self-hosting Consumet

Consumet publishes a Docker image for its REST API (see the project's own
documentation for the current image name/tag). Point `PROVIDER_CONSUMET_BASE_URL`
at wherever you run it — this package never talks to a public/shared instance by
default.

## Removing this provider

Delete this package, remove its dependency from `apps/backend/package.json`, and
remove the two lines in `apps/backend/src/admin/infrastructure/providersRuntime.ts`
that register it. Nothing else in the platform references Consumet by name.
