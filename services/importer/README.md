# Import Pipeline

Implements Milestone 4: a production-ready, **provider-agnostic** content
ingestion pipeline, per `specification/08-Import-Pipeline.md.txt`. It never
depends on a concrete provider — every provider interaction goes through
`ProviderInterface`/`ProviderRegistry` from `@ctv-platform/sdk` (Milestone
3). No concrete provider (Cinemana, TMDB) exists yet, so every module here
is exercised against fakes/injected doubles.

This package sits above `@ctv-platform/domain`, `@ctv-platform/infrastructure`,
and `@ctv-platform/sdk` in the dependency graph (the Application Layer, per
`specification/22-Architecture-Decisions.md.txt` Decision 2) and depends on
all three; none of those completed milestones were modified to build it.

## Structure

```
src/
  enums.ts, config.ts, errors.ts, types.ts   Shared pipeline vocabulary
  persistence/    Provider link, Stream, Subtitle, Image — Prisma-backed
                  repositories for tables Milestone 1/2 didn't model as
                  domain aggregates (see "Persistence" below)
  matching/       External-id/title/fuzzy matching chain, duplicate
                  detection, canonical content resolution
  metadata/       Enrichment, validation, merge, normalization
  media/          Stream/subtitle import, artwork processing + import
  validation/     Stream/subtitle/content validators + composed pipeline
  publishing/     Catalog publish, cache invalidation, event publishing,
                  search-index-update request
  discovery/      Discovery engine (Incremental/Full/Scheduled/Manual) +
                  checkpoint store
  orchestrator/   Per-movie and per-show pipelines, progress tracking,
                  concurrency-limited batch processing
  jobs/           Job payload types
  queues/         Discovery Queue + Import Queue, built on
                  @ctv-platform/infrastructure's QueueClient
  workers/        Discovery worker, import worker (retry/DLQ/metrics)
  scheduler/      Scheduled/manual/incremental/full discovery triggers
  operations/     Job retry policy, dead letter queue, metrics, structured
                  stage logging
```

## Persistence: what's new here vs. reused

`Movie`/`TVShow`/`Season`/`Episode` are reused exactly as Milestone 1/2 left
them — their domain entities, repositories, and `PrismaUnitOfWork` are never
duplicated. `Provider`, `MovieProvider`/`TVShowProvider`/`EpisodeProvider`,
`Stream`, `Subtitle`, and `Image` were never modeled as domain aggregates or
given repositories in Milestone 1/2 (out of that scope), so `persistence/`
defines small local ports and Prisma-backed adapters for them, following the
exact mapper/repository conventions Milestone 2 established. They live here
— not in `packages/domain` or `packages/infrastructure` — specifically so
neither completed milestone needed to change.

Two schema-driven decisions worth knowing:

- **Streams** have no provider-side id column, so `streamUrl` is the natural
  identity within a movie/episode link. Reconciling a re-scan updates
  matching URLs in place, creates new ones, and marks missing ones
  `isActive: false` — never deletes — per "Streams must never overwrite
  each other. Inactive streams remain stored."
- **Subtitles** have no `isActive` column, so there is no deactivation
  concept; unseen subtitles are simply left alone.

## Duplicate protection vs. TMDB matching — two different questions

Per `specification/08-Import-Pipeline.md.txt` ("Duplicate Protection:
Provider ID Unique"), **whether a discovered item already exists in our
database** is answered primarily by the `MovieProvider`/`TVShowProvider`/
`EpisodeProvider` join row for `(provider, externalId)` — not by the TMDB
matching chain. TMDB-style matching (`matching/contentMatcher.ts`) answers a
different question: _which entry in a metadata-enrichment provider
corresponds to this content_, so it can be enriched. `findByTmdbId` on the
existing domain repository is used as a secondary cross-provider duplicate
safety net.

## Scope boundaries (documented, not hidden)

- **Cast/crew/companies/countries/languages/collections** import
  (`specification/07-TMDB-Integration.md.txt`) requires domain aggregates
  Milestone 1 never modeled (`Person`, `Company`, `Genre`, `Collection`).
  Out of scope here; only fields the `Movie`/`TVShow`/`Episode` aggregates
  can actually hold (title, overview, rating, runtime, trailer, artwork)
  are enriched.
- `ProviderMovieDto` has no rating/runtime/trailer fields (a Milestone 3
  DTO gap when applied to a metadata-enrichment provider). Those flow
  through the same `raw` passthrough convention already used for
  `imdbId`/`tmdbId` (see `metadata/extractEnrichmentFields.ts`).
- **Search indexing**: there is no search infrastructure yet (Milestone 8
  scope). `publishing/searchIndexUpdater.ts` publishes a real
  `ContentIndexUpdateRequestedEvent` via the domain `EventBus`; a future
  search subscriber consumes it. This is working code for what the
  milestone can deliver today, not a stand-in pretending to query an index
  that doesn't exist.
- **Image processing**: pixel-level resize/compress/convert (Sharp, per
  `specification/03-Technology-Stack.md.txt`) is Milestone 8 scope; this
  pipeline validates and selects artwork URLs, never downloads bytes.
- **Discovery checkpoints** are process-lifetime (in-memory). A durable
  adapter is reasonable future work but would need a new repository, which
  is out of scope for the same reason as above.
- **Queue topology**: the specification names nine queues (Discovery,
  Movie, TV, Stream, Subtitle, TMDB, Artwork, Validation, Search). This
  implementation runs two real queues (Discovery, Import); every stage
  after discovery runs in-process within a single import job. Fanning out
  into the full nine-queue topology is a scaling optimization, not a
  functional requirement, and is left for Milestone 8.

## Testing

Every module is exercised with fakes — a fake `ProviderInterface`, fake
domain repositories, a fake Prisma client, `InMemoryQueueClient`, and
injectable clocks/delays — per the project's testing rules (no network
calls, no real database). Test files are grouped by what they exercise:
matching, metadata, media, validation, publishing, discovery, orchestrator
(pipeline-level, end-to-end through fakes), workers/scheduler (integration
of queue + worker + retry/DLQ), and persistence (against a fake Prisma
client, mirroring how the infrastructure package tests its own
repositories).

```bash
pnpm --filter @ctv-platform/importer build
pnpm --filter @ctv-platform/importer test
```
