import test from 'node:test';
import assert from 'node:assert/strict';
import { Movie } from '@ctv-platform/domain';
import { CacheInvalidator, CatalogPublisher } from '../dist/index.js';

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
  const calls = [];
  return {
    calls,
    ensureProvider: async () => 'provider-db-id',
    findMovieIdByExternalId: async () => null,
    ensureMovieLink: async (movieId, providerDbId, externalId, sourceTitle) => {
      calls.push({ movieId, providerDbId, externalId, sourceTitle });
      return 'movie-link-id';
    },
    findEpisodeIdByExternalId: async () => null,
    ensureEpisodeLink: async () => 'episode-link-id',
    findShowIdByExternalId: async () => null,
    ensureShowLink: async () => 'show-link-id',
  };
}

test('publishMovie publishes an available movie and links it to its provider', async () => {
  const movies = fakeMovies();
  const links = fakeLinks();
  const publisher = new CatalogPublisher(movies, fakeShows(), links);
  const movie = Movie.create({ id: 'm1', title: 'Arrival' });

  const linkId = await publisher.publishMovie(movie, 'provider-db-id', 'ext-1', true);

  assert.equal(linkId, 'movie-link-id');
  assert.equal(movie.status, 'published');
  assert.equal(movies.saved.length, 1);
  assert.equal(links.calls[0].externalId, 'ext-1');
});

test('publishMovie removes an unavailable movie instead of publishing it', async () => {
  const movies = fakeMovies();
  const publisher = new CatalogPublisher(movies, fakeShows(), fakeLinks());
  const movie = Movie.create({ id: 'm1', title: 'Arrival' });
  movie.publish();

  await publisher.publishMovie(movie, 'provider-db-id', 'ext-1', false);

  assert.equal(movie.status, 'removed');
});

test('CacheInvalidator deletes the movie key and the catalog key', async () => {
  const deleted = [];
  const cache = {
    get: async () => null,
    set: async () => {},
    del: async (key) => deleted.push(key),
  };
  const invalidator = new CacheInvalidator(cache);

  await invalidator.invalidateMovie('m1');

  assert.deepEqual(deleted.sort(), ['catalog:newest', 'movie:m1'].sort());
});
