import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainEventDispatcher, EventBus, Movie, err, ok } from '@ctv-platform/domain';
import { ProviderCapabilityEnum, ProviderErrorCodeEnum, ProviderRegistry } from '@ctv-platform/sdk';
import {
  ArtworkImporter,
  CacheInvalidator,
  CatalogPublisher,
  ContentMatcher,
  EventPublisher,
  ImportFailureCategoryEnum,
  MetadataEnricher,
  MovieImportOrchestrator,
  PublishingPipeline,
  SearchIndexUpdater,
  StreamImporter,
  SubtitleImporter,
} from '../dist/index.js';

function fakeMovies() {
  const saved = [];
  return {
    saved,
    save: async (movie) => saved.push(movie),
    findById: async (id) => saved.find((movie) => movie.id === id) ?? null,
    findByTmdbId: async () => null,
    list: async () => [],
  };
}

function fakeShows() {
  return {
    save: async () => {},
    findById: async () => null,
    findByTmdbId: async () => null,
    list: async () => [],
  };
}

function fakeLinks(overrides = {}) {
  return {
    ensureProvider: async () => 'provider-db-id',
    findMovieIdByExternalId: async () => null,
    ensureMovieLink: async () => 'movie-link-id',
    findEpisodeIdByExternalId: async () => null,
    ensureEpisodeLink: async () => 'episode-link-id',
    findShowIdByExternalId: async () => null,
    ensureShowLink: async () => 'show-link-id',
    ...overrides,
  };
}

function recordingPort() {
  const calls = [];
  return {
    calls,
    reconcileForMovieLink: async (linkId, items) => {
      calls.push({ linkId, items });
      return { created: items.length, updated: 0, deactivated: 0 };
    },
    reconcileForEpisodeLink: async () => ({ created: 0, updated: 0, deactivated: 0 }),
    reconcileForMovie: async (movieId, items) => {
      calls.push({ movieId, items });
      return { created: items.length, updated: 0, deactivated: 0 };
    },
    reconcileForShow: async () => ({ created: 0, updated: 0, deactivated: 0 }),
  };
}

function validMovieDto(overrides = {}) {
  return {
    providerMovieId: 'c-1',
    title: 'Arrival',
    isAvailable: true,
    artwork: { poster: 'https://cinemana.example/poster.jpg' },
    streams: [
      {
        providerStreamId: 's1',
        quality: '1080p',
        serverName: 'A',
        playbackUrl: 'https://cinemana.example/s1.m3u8',
      },
    ],
    subtitles: [
      {
        language: 'en',
        format: 'SRT',
        downloadUrl: 'https://cinemana.example/en.srt',
        isDefault: true,
        providerName: 'cinemana',
      },
    ],
    ...overrides,
  };
}

function buildHarness({ links, movies = fakeMovies(), metadataProvider } = {}) {
  const registry = new ProviderRegistry();
  const streams = recordingPort();
  const subtitles = recordingPort();
  const artwork = recordingPort();
  const bus = new EventBus();
  const cacheDeletes = [];
  const cache = {
    get: async () => null,
    set: async () => {},
    del: async (key) => cacheDeletes.push(key),
  };

  const publishingPipeline = new PublishingPipeline(
    new CatalogPublisher(movies, fakeShows(), links ?? fakeLinks()),
    new CacheInvalidator(cache),
    new EventPublisher(new DomainEventDispatcher(bus)),
    new SearchIndexUpdater(bus),
  );

  const orchestrator = new MovieImportOrchestrator({
    registry,
    movies,
    links: links ?? fakeLinks(),
    streamImporter: new StreamImporter(streams),
    subtitleImporter: new SubtitleImporter(subtitles),
    artworkImporter: new ArtworkImporter(artwork),
    metadataEnricher: new MetadataEnricher(new ContentMatcher(0.9)),
    publishingPipeline,
  });

  if (metadataProvider) {
    registry.register(metadataProvider);
  }

  return { registry, orchestrator, movies, streams, subtitles, artwork, cacheDeletes };
}

function contentProvider(movieResult) {
  return {
    metadata: { id: 'cinemana', name: 'Cinemana', capabilities: [] },
    supports: () => false,
    movie: async () => movieResult,
  };
}

test('imports a brand new movie end-to-end: fetch, validate, publish, and import media', async () => {
  const { orchestrator, movies, streams, subtitles, artwork } = buildHarness();
  const provider = contentProvider(ok(validMovieDto()));

  const result = await orchestrator.importOne(provider, 'c-1');

  assert.equal(result.ok, true);
  assert.equal(movies.saved.length, 1);
  assert.equal(movies.saved[0].status, 'published');
  assert.equal(streams.calls.length, 1);
  assert.equal(subtitles.calls.length, 1);
  assert.equal(artwork.calls.length, 1);
});

test('enriches metadata from a registered metadata-enrichment provider before publishing', async () => {
  const metadataProvider = {
    metadata: {
      id: 'tmdb',
      name: 'TMDB',
      capabilities: [ProviderCapabilityEnum.METADATA_ENRICHMENT],
    },
    supports: (capability) => capability === ProviderCapabilityEnum.METADATA_ENRICHMENT,
    search: async () =>
      ok({
        items: [{ providerContentId: 'tmdb-1', kind: 'movie', title: 'Arrival', artwork: {} }],
        totalCount: 1,
      }),
    movie: async () =>
      ok({
        providerMovieId: 'tmdb-1',
        title: 'Arrival',
        overview: 'A linguist deciphers an alien language.',
        isAvailable: true,
        artwork: {},
        streams: [],
        subtitles: [],
        raw: { rating: 7.9, runtimeMinutes: 116 },
      }),
  };
  const { orchestrator, movies } = buildHarness({ metadataProvider });
  const provider = contentProvider(ok(validMovieDto()));

  const result = await orchestrator.importOne(provider, 'c-1');

  assert.equal(result.ok, true);
  assert.equal(movies.saved[0].overview, 'A linguist deciphers an alien language.');
  assert.equal(movies.saved[0].rating.value, 7.9);
  assert.equal(movies.saved[0].runtime.minutes, 116);
});

test('fails with a validation error and publishes nothing when there are no valid streams', async () => {
  const { orchestrator, movies } = buildHarness();
  const provider = contentProvider(ok(validMovieDto({ streams: [] })));

  const result = await orchestrator.importOne(provider, 'c-1');

  assert.equal(result.ok, false);
  assert.equal(result.error.category, ImportFailureCategoryEnum.VALIDATION_ERROR);
  assert.equal(movies.saved.length, 0);
});

test('maps a provider fetch failure to the corresponding job failure category', async () => {
  const { orchestrator } = buildHarness();
  const provider = contentProvider(
    err({ code: ProviderErrorCodeEnum.NOT_FOUND, message: 'missing', providerId: 'cinemana' }),
  );

  const result = await orchestrator.importOne(provider, 'c-1');

  assert.equal(result.ok, false);
  assert.equal(result.error.category, ImportFailureCategoryEnum.PROVIDER_ERROR);
});

test('reuses the existing movie (update path) when a provider link already exists', async () => {
  const movies = fakeMovies();
  const existing = Movie.create({ id: 'existing-id', title: 'Old Title' });
  movies.saved.push(existing);
  const links = fakeLinks({ findMovieIdByExternalId: async () => 'existing-id' });
  const { orchestrator } = buildHarness({ links, movies });
  const provider = contentProvider(ok(validMovieDto({ title: 'Arrival' })));

  const result = await orchestrator.importOne(provider, 'c-1');

  assert.equal(result.ok, true);
  assert.equal(result.value.contentId, 'existing-id');
  assert.equal(movies.saved.length, 2); // initial seed + the save() call performed by the pipeline
  assert.equal(movies.saved[1].id, 'existing-id');
});
