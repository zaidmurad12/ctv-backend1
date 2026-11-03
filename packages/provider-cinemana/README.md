# @ctv-platform/provider-cinemana

A concrete `ProviderInterface` implementation (see `@ctv-platform/sdk`) backed directly
by `cinemana.shabakaty.com`'s own API — the undocumented backend the official
"Shabakaty Cinemana" Android app itself calls. It supplies **streams and subtitles**
(Arabic + English, both `.srt` and `.vtt`) plus title search — it never supplies
descriptive metadata (title/overview/artwork) for anything already in our catalog, so
it can never override TMDB or any other metadata-enrichment provider.

Unlike `@ctv-platform/provider-consumet`, this needs no separate server of its own —
there is no self-hosting step. The tradeoff is that it depends entirely on a private
API we don't control and that could change or disappear without notice.

## Legal note

This is a reverse-engineered, undocumented private API belonging to a third-party
commercial app ("Shabakaty Cinemana"), not a public/official one — it was found by
inspecting the network calls another open-source client (`hasanpasha/cinemana`) makes,
not by reading any published API documentation. Shabakaty Cinemana itself offers a
large library of movies/TV (including recent, non-regional releases) for free with no
subscription, which is generally a strong signal that the underlying content isn't
properly licensed. Enabling this provider means this platform's stream/subtitle
results can come from that source. This is a deliberate choice made by whoever deploys
this platform, not a default, and carries real legal exposure (copyright infringement
via the underlying content, and potentially ToS/API-abuse exposure against Shabakaty
Cinemana itself) beyond the generic scraper risk already documented for Consumet.

## Configuration

All env vars are read once, in `src/config.ts`, by the host application:

| Variable                              | Default                                      | Purpose                                                                                                       |
| ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PROVIDER_CINEMANA_ENABLED`           | `false`                                      | Master on/off switch. When `false`, the host app never registers this provider — no network calls, no errors. |
| `PROVIDER_CINEMANA_BASE_URL`          | `https://cinemana.shabakaty.com/api/android` | Base URL of the API. Overridable purely so a changed upstream host doesn't need a code change.                |
| `PROVIDER_CINEMANA_PRIORITY`          | `40`                                         | Lower number = higher priority among registered providers.                                                    |
| `PROVIDER_CINEMANA_TIMEOUT_MS`        | `15000`                                      | Per-request timeout.                                                                                          |
| `PROVIDER_CINEMANA_MAX_RPS`           | `5`                                          | Requests/second cap enforced by the SDK's rate limiter.                                                       |
| `PROVIDER_CINEMANA_CACHE_TTL_SECONDS` | `21600`                                      | How long raw HTTP responses (including presigned stream/subtitle URLs) are cached in-process.                 |

## Turning it off at any time

Two independent ways, both effective immediately with no redeploy:

- **Admin panel → مزودو الخدمة (Providers)**: disable it there (`POST admin/providers/cinemana/disable`).
  This is a runtime DB flag (`Provider.isEnabled`) - the provider stays registered but
  `ProviderStreamResolver` skips it.
- **`PROVIDER_CINEMANA_ENABLED=false`** (or unset) on the backend, then redeploy: the
  provider is never registered at all, as if this package weren't installed.

## Removing this provider entirely

Delete this package, remove its dependency from `apps/backend/package.json`, and
remove the lines in `apps/backend/src/providers/providersRuntime.ts` that register it.
Nothing else in the platform references Cinemana by name.
