import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainEventDispatcher, EventBus, Movie } from '@ctv-platform/domain';
import {
  CacheInvalidator,
  CatalogPublisher,
  EventPublisher,
  PublishingPipeline,
  SearchIndexUpdater,
} from '../dist/index.js';

function fakeMovies() {
  const saved = [];
  return {
    saved,
    save: async (movie) => saved.push(movie),
    findById: async () => null,
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

function fakeLinks() {
  return {
    ensureProvider: async () => 'provider-db-id',
    findMovieIdByExternalId: async () => null,
    ensureMovieLink: async () => 'movie-link-id',
    findEpisodeIdByExternalId: async () => null,
    ensureEpisodeLink: async () => 'episode-link-id',
    findShowIdByExternalId: async () => null,
    ensureShowLink: async () => 'show-link-id',
  };
}

function buildPipeline() {
  const cacheDeletes = [];
  const busEvents = [];
  const bus = new EventBus();
  bus.subscribe((event) => busEvents.push(event));
  const cache = {
    get: async () => null,
    set: async () => {},
    del: async (key) => cacheDeletes.push(key),
  };

  const pipeline = new PublishingPipeline(
    new CatalogPublisher(fakeMovies(), fakeShows(), fakeLinks()),
    new CacheInvalidator(cache),
    new EventPublisher(new DomainEventDispatcher(bus)),
    new SearchIndexUpdater(bus),
  );

  return { pipeline, cacheDeletes, busEvents };
}

test('publishMovie runs every stage and returns the publish outcome', async () => {
  const { pipeline, cacheDeletes, busEvents } = buildPipeline();
  const movie = Movie.create({ id: 'm1', title: 'Arrival' });

  const result = await pipeline.publishMovie(movie, 'provider-db-id', 'ext-1', true);

  assert.equal(result.ok, true);
  assert.equal(result.value.contentId, 'm1');
  assert.equal(result.value.linkId, 'movie-link-id');
  assert.ok(cacheDeletes.includes('movie:m1'));
  assert.equal(
    busEvents.some((event) => event.eventType === 'ContentPublished'),
    true,
  );
  assert.equal(
    busEvents.some((event) => event.eventType === 'ContentIndexUpdateRequested'),
    true,
  );
});

test('publishMovie turns an unexpected exception into an ImportResult error instead of throwing', async () => {
  const cache = { get: async () => null, set: async () => {}, del: async () => {} };
  const bus = new EventBus();
  const brokenLinks = {
    ...fakeLinks(),
    ensureMovieLink: async () => {
      throw new Error('db unavailable');
    },
  };
  const pipeline = new PublishingPipeline(
    new CatalogPublisher(fakeMovies(), fakeShows(), brokenLinks),
    new CacheInvalidator(cache),
    new EventPublisher(new DomainEventDispatcher(bus)),
    new SearchIndexUpdater(bus),
  );

  const result = await pipeline.publishMovie(
    Movie.create({ id: 'm1', title: 'Arrival' }),
    'p',
    'e',
    true,
  );

  assert.equal(result.ok, false);
  assert.match(result.error.message, /db unavailable/);
});
