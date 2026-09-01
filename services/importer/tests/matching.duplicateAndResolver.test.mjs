import test from 'node:test';
import assert from 'node:assert/strict';
import { Movie, TVShow } from '@ctv-platform/domain';
import {
  CanonicalMovieResolver,
  CanonicalShowResolver,
  extractExternalIdentifiers,
  MovieDuplicateDetector,
  ShowDuplicateDetector,
} from '../dist/index.js';

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

function fakeMovieRepository(overrides = {}) {
  return {
    save: async () => {},
    findById: async () => null,
    findByTmdbId: async () => null,
    list: async () => [],
    ...overrides,
  };
}

function fakeShowRepository(overrides = {}) {
  return {
    save: async () => {},
    findById: async () => null,
    findByTmdbId: async () => null,
    list: async () => [],
    ...overrides,
  };
}

test('extractExternalIdentifiers reads imdbId/tmdbId out of the raw passthrough field', () => {
  const identifiers = extractExternalIdentifiers({
    providerMovieId: 'm1',
    title: 'Arrival',
    originalTitle: 'Arrival',
    releaseDate: '2016-11-11',
    isAvailable: true,
    artwork: {},
    streams: [],
    subtitles: [],
    raw: { imdbId: 'tt2543164', tmdbId: '329865' },
  });

  assert.equal(identifiers.imdbId, 'tt2543164');
  assert.equal(identifiers.tmdbId, '329865');
  assert.equal(identifiers.releaseYear, 2016);
});

test('MovieDuplicateDetector prefers the provider link over the TMDB fallback', async () => {
  const links = fakeLinks({ findMovieIdByExternalId: async () => 'linked-movie-id' });
  const movies = fakeMovieRepository({ findByTmdbId: async () => ({ id: 'tmdb-fallback-id' }) });
  const detector = new MovieDuplicateDetector(links, movies);

  const existingId = await detector.findExistingId('provider-db-id', 'ext-1', 'tmdb-1');

  assert.equal(existingId, 'linked-movie-id');
});

test('MovieDuplicateDetector falls back to the TMDB id when there is no provider link', async () => {
  const links = fakeLinks();
  const movies = fakeMovieRepository({ findByTmdbId: async () => ({ id: 'tmdb-fallback-id' }) });
  const detector = new MovieDuplicateDetector(links, movies);

  const existingId = await detector.findExistingId('provider-db-id', 'ext-1', 'tmdb-1');

  assert.equal(existingId, 'tmdb-fallback-id');
});

test('MovieDuplicateDetector returns null when nothing matches', async () => {
  const detector = new MovieDuplicateDetector(fakeLinks(), fakeMovieRepository());

  assert.equal(await detector.findExistingId('provider-db-id', 'ext-1'), null);
});

test('ShowDuplicateDetector uses the show-specific provider link', async () => {
  const links = fakeLinks({ findShowIdByExternalId: async () => 'linked-show-id' });
  const detector = new ShowDuplicateDetector(links, fakeShowRepository());

  assert.equal(await detector.findExistingId('provider-db-id', 'ext-1'), 'linked-show-id');
});

test('CanonicalMovieResolver reuses an existing movie when the detector finds one', async () => {
  const existingMovie = Movie.create({ id: 'existing-id', title: 'Old Title' });
  const links = fakeLinks({ findMovieIdByExternalId: async () => 'existing-id' });
  const movies = fakeMovieRepository({
    findById: async (id) => (id === 'existing-id' ? existingMovie : null),
  });
  const resolver = new CanonicalMovieResolver(links, movies);

  const { movie, isNew } = await resolver.resolve('provider-db-id', 'ext-1', 'New Title');

  assert.equal(isNew, false);
  assert.equal(movie.id, 'existing-id');
});

test('CanonicalMovieResolver creates a new movie when nothing is found', async () => {
  const resolver = new CanonicalMovieResolver(fakeLinks(), fakeMovieRepository());

  const { movie, isNew } = await resolver.resolve('provider-db-id', 'ext-1', 'Brand New');

  assert.equal(isNew, true);
  assert.equal(movie.title.value, 'Brand New');
});

test('CanonicalShowResolver creates a new show when nothing is found', async () => {
  const resolver = new CanonicalShowResolver(fakeLinks(), fakeShowRepository());

  const { show, isNew } = await resolver.resolve('provider-db-id', 'ext-1', 'Brand New Show');

  assert.equal(isNew, true);
  assert.ok(show instanceof TVShow);
});
