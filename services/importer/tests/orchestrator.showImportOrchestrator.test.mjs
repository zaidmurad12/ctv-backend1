import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainEventDispatcher, EventBus, ok } from '@ctv-platform/domain';
import { ProviderRegistry } from '@ctv-platform/sdk';
import {
  ArtworkImporter,
  CacheInvalidator,
  CatalogPublisher,
  ContentMatcher,
  EventPublisher,
  ImportFailureCategoryEnum,
  MetadataEnricher,
  PublishingPipeline,
  SearchIndexUpdater,
  ShowImportOrchestrator,
  StreamImporter,
  SubtitleImporter,
} from '../dist/index.js';

function fakeShows() {
  const saved = [];
  return {
    saved,
    save: async (show) => saved.push(show),
    findById: async () => null,
    findByTmdbId: async () => null,
    list: async () => [],
  };
}

function fakeMovies() {
  return {
    save: async () => {},
    findById: async () => null,
    findByTmdbId: async () => null,
    list: async () => [],
  };
}

function fakeSeasons() {
  const saved = [];
  return {
    saved,
    save: async (season) => saved.push(season),
    findById: async () => null,
    findByShowId: async () => [...saved],
  };
}

function fakeEpisodes() {
  const saved = [];
  return {
    saved,
    save: async (episode) => saved.push(episode),
    findById: async () => null,
    findBySeasonId: async (seasonId) => saved.filter((episode) => episode.seasonId === seasonId),
  };
}

function fakeLinks() {
  let episodeLinkCounter = 0;
  return {
    ensureProvider: async () => 'provider-db-id',
    findMovieIdByExternalId: async () => null,
    ensureMovieLink: async () => 'movie-link-id',
    findEpisodeIdByExternalId: async () => null,
    ensureEpisodeLink: async () => {
      episodeLinkCounter += 1;
      return `episode-link-${episodeLinkCounter}`;
    },
    findShowIdByExternalId: async () => null,
    ensureShowLink: async () => 'show-link-id',
  };
}

function stubPort() {
  return {
    reconcileForMovieLink: async (linkId, items) => ({
      created: items.length,
      updated: 0,
      deactivated: 0,
    }),
    reconcileForEpisodeLink: async (linkId, items) => ({
      created: items.length,
      updated: 0,
      deactivated: 0,
    }),
    reconcileForMovie: async (id, items) => ({ created: items.length, updated: 0, deactivated: 0 }),
    reconcileForShow: async (id, items) => ({ created: items.length, updated: 0, deactivated: 0 }),
  };
}

function buildHarness() {
  const registry = new ProviderRegistry();
  const shows = fakeShows();
  const seasons = fakeSeasons();
  const episodes = fakeEpisodes();
  const bus = new EventBus();
  const cache = { get: async () => null, set: async () => {}, del: async () => {} };

  const publishingPipeline = new PublishingPipeline(
    new CatalogPublisher(fakeMovies(), shows, fakeLinks()),
    new CacheInvalidator(cache),
    new EventPublisher(new DomainEventDispatcher(bus)),
    new SearchIndexUpdater(bus),
  );

  const orchestrator = new ShowImportOrchestrator({
    registry,
    shows,
    seasons,
    episodes,
    links: fakeLinks(),
    streamImporter: new StreamImporter(stubPort()),
    subtitleImporter: new SubtitleImporter(stubPort()),
    artworkImporter: new ArtworkImporter(stubPort()),
    metadataEnricher: new MetadataEnricher(new ContentMatcher(0.9)),
    publishingPipeline,
  });

  return { orchestrator, shows, seasons, episodes };
}

function validStream(id) {
  return {
    providerStreamId: id,
    quality: '1080p',
    serverName: 'A',
    playbackUrl: `https://cinemana.example/${id}`,
  };
}

function showProvider(showDto) {
  return {
    metadata: { id: 'cinemana', name: 'Cinemana', capabilities: [] },
    supports: () => false,
    show: async () => ok(showDto),
  };
}

test('imports a show with its seasons and episodes end-to-end', async () => {
  const { orchestrator, shows, seasons, episodes } = buildHarness();
  const provider = showProvider({
    providerShowId: 'sh-1',
    title: 'Severance',
    isAvailable: true,
    artwork: {},
    seasons: [
      {
        providerSeasonId: 'season-1',
        seasonNumber: 1,
        title: 'Season One',
        episodes: [
          {
            providerEpisodeId: 'ep-1',
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Good News About Hell',
            isAvailable: true,
            streams: [validStream('e1s1')],
            subtitles: [],
          },
          {
            providerEpisodeId: 'ep-2',
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'Half Loop',
            isAvailable: true,
            streams: [validStream('e2s1')],
            subtitles: [],
          },
        ],
      },
    ],
  });

  const result = await orchestrator.importOne(provider, 'sh-1');

  assert.equal(result.ok, true);
  assert.equal(shows.saved.length, 1);
  assert.equal(shows.saved[0].seasonCount, 1);
  assert.equal(shows.saved[0].episodeCount, 2);
  assert.equal(seasons.saved.length, 1);
  assert.equal(episodes.saved.length, 2);
});

test('skips an episode with no valid streams but still publishes the rest of the show', async () => {
  const { orchestrator, episodes } = buildHarness();
  const provider = showProvider({
    providerShowId: 'sh-1',
    title: 'Severance',
    isAvailable: true,
    artwork: {},
    seasons: [
      {
        providerSeasonId: 'season-1',
        seasonNumber: 1,
        episodes: [
          {
            providerEpisodeId: 'ep-1',
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Has Streams',
            isAvailable: true,
            streams: [validStream('ok')],
            subtitles: [],
          },
          {
            providerEpisodeId: 'ep-2',
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'No Streams',
            isAvailable: true,
            streams: [],
            subtitles: [],
          },
        ],
      },
    ],
  });

  const result = await orchestrator.importOne(provider, 'sh-1');

  assert.equal(result.ok, true);
  assert.equal(episodes.saved.length, 1);
  assert.equal(episodes.saved[0].title.value, 'Has Streams');
});

test('fails validation when the show has no seasons at all', async () => {
  const { orchestrator, shows } = buildHarness();
  const provider = showProvider({
    providerShowId: 'sh-1',
    title: 'Empty Show',
    isAvailable: true,
    artwork: {},
    seasons: [],
  });

  const result = await orchestrator.importOne(provider, 'sh-1');

  assert.equal(result.ok, false);
  assert.equal(result.error.category, ImportFailureCategoryEnum.VALIDATION_ERROR);
  assert.equal(shows.saved.length, 0);
});
