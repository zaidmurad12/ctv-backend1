import test from 'node:test';
import assert from 'node:assert/strict';
import { EpisodeMapper, MovieMapper, SeasonMapper, TVShowMapper } from '../dist/index.js';

test('MovieMapper.toDomain rehydrates status, rating and runtime from a persisted row', () => {
  const createdAt = new Date('2024-01-01T00:00:00.000Z');
  const updatedAt = new Date('2024-02-01T00:00:00.000Z');

  const movie = MovieMapper.toDomain({
    id: 'movie-1',
    title: 'Arrival',
    overview: 'A linguist deciphers an alien language.',
    status: 'PUBLISHED',
    runtime: 116,
    rating: 7.9,
    trailer: 'https://example.com/trailer.mp4',
    createdAt,
    updatedAt,
  });

  assert.equal(movie.id, 'movie-1');
  assert.equal(movie.title.value, 'Arrival');
  assert.equal(movie.status, 'published');
  assert.equal(movie.runtime.minutes, 116);
  assert.equal(movie.rating.value, 7.9);
  assert.equal(movie.trailerUrl.value, 'https://example.com/trailer.mp4');
  assert.equal(movie.createdAt.getTime(), createdAt.getTime());
  assert.equal(movie.updatedAt.getTime(), updatedAt.getTime());
});

test('MovieMapper.toDomain handles null optional fields', () => {
  const now = new Date();
  const movie = MovieMapper.toDomain({
    id: 'movie-2',
    title: 'Untitled',
    overview: null,
    status: 'DRAFT',
    runtime: null,
    rating: null,
    trailer: null,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(movie.overview, null);
  assert.equal(movie.runtime, null);
  assert.equal(movie.rating, null);
  assert.equal(movie.trailerUrl, null);
});

test('MovieMapper.toCreateInput/toUpdateInput map domain status back to the Prisma enum', () => {
  const movie = MovieMapper.toDomain({
    id: 'movie-3',
    title: 'Dune',
    overview: null,
    status: 'REMOVED',
    runtime: 155,
    rating: null,
    trailer: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const createInput = MovieMapper.toCreateInput(movie);
  const updateInput = MovieMapper.toUpdateInput(movie);

  assert.equal(createInput.id, 'movie-3');
  assert.equal(createInput.status, 'REMOVED');
  assert.equal(createInput.runtime, 155);
  assert.equal(updateInput.status, 'REMOVED');
  assert.equal(updateInput.title, 'Dune');
});

test('TVShowMapper round-trips season and episode counts', () => {
  const now = new Date();
  const show = TVShowMapper.toDomain({
    id: 'show-1',
    title: 'Foundation',
    overview: null,
    status: 'PUBLISHED',
    numberOfSeasons: 2,
    numberOfEpisodes: 20,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(show.seasonCount, 2);
  assert.equal(show.episodeCount, 20);

  const createInput = TVShowMapper.toCreateInput(show);
  assert.equal(createInput.numberOfSeasons, 2);
  assert.equal(createInput.numberOfEpisodes, 20);
});

test('SeasonMapper maps the Prisma "name" column to the domain title', () => {
  const now = new Date();
  const season = SeasonMapper.toDomain({
    id: 'season-1',
    showId: 'show-1',
    seasonNumber: 1,
    name: 'Season One',
    overview: null,
    episodeCount: 10,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(season.title.value, 'Season One');

  const createInput = SeasonMapper.toCreateInput(season);
  assert.equal(createInput.name, 'Season One');
});

test('SeasonMapper handles a null season title', () => {
  const now = new Date();
  const season = SeasonMapper.toDomain({
    id: 'season-2',
    showId: 'show-1',
    seasonNumber: 2,
    name: null,
    overview: null,
    episodeCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(season.title, null);
  assert.equal(SeasonMapper.toCreateInput(season).name, null);
});

test('EpisodeMapper defaults status to published since the column does not exist', () => {
  const now = new Date();
  const episode = EpisodeMapper.toDomain({
    id: 'episode-1',
    seasonId: 'season-1',
    episodeNumber: 3,
    title: 'The Signal',
    overview: null,
    runtime: 42,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(episode.status, 'published');
  assert.equal(episode.episodeNumber, 3);
  assert.equal(episode.runtime.minutes, 42);

  const createInput = EpisodeMapper.toCreateInput(episode);
  assert.equal(createInput.seasonId, 'season-1');
  assert.equal(createInput.episodeNumber, 3);
});
