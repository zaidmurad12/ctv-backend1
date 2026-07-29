import test from 'node:test';
import assert from 'node:assert/strict';
import { Movie } from '@ctv-platform/domain';
import {
  PrismaEpisodeRepository,
  PrismaMovieRepository,
  PrismaSeasonRepository,
  PrismaTVShowRepository,
} from '../dist/index.js';

function fakeModel(rows) {
  const calls = { upsert: [], findFirst: [], findMany: [], findUnique: [] };
  return {
    calls,
    async upsert(args) {
      calls.upsert.push(args);
      const existing = rows.find((row) => row.id === args.where.id);
      const record = existing ? { ...existing, ...args.update } : { ...args.create };
      const index = rows.findIndex((row) => row.id === record.id);
      if (index >= 0) {
        rows[index] = record;
      } else {
        rows.push(record);
      }
      return record;
    },
    async findFirst(args) {
      calls.findFirst.push(args);
      return (
        rows.find((row) =>
          Object.entries(args.where).every(([key, value]) =>
            value === null ? row[key] == null : row[key] === value,
          ),
        ) ?? null
      );
    },
    async findMany(args) {
      calls.findMany.push(args);
      return rows.filter((row) =>
        Object.entries(args.where ?? {}).every(([key, value]) =>
          value === null ? row[key] == null : row[key] === value,
        ),
      );
    },
    async findUnique(args) {
      calls.findUnique.push(args);
      return rows.find((row) => row.id === args.where.id) ?? null;
    },
  };
}

test('PrismaMovieRepository.save upserts and findById filters out soft-deleted rows', async () => {
  const now = new Date();
  const movieModel = fakeModel([
    {
      id: 'deleted-1',
      title: 'Old',
      overview: null,
      status: 'REMOVED',
      runtime: null,
      rating: null,
      trailer: null,
      tmdbId: null,
      deletedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const repository = new PrismaMovieRepository({ movie: movieModel });

  const movie = Movie.create({ id: 'movie-1', title: 'Interstellar' });
  await repository.save(movie);

  assert.equal(movieModel.calls.upsert.length, 1);
  assert.equal(movieModel.calls.upsert[0].create.title, 'Interstellar');

  const found = await repository.findById('movie-1');
  assert.equal(found.title.value, 'Interstellar');

  const softDeleted = await repository.findById('deleted-1');
  assert.equal(softDeleted, null);
});

test('PrismaTVShowRepository.findByTmdbId maps a matching row', async () => {
  const now = new Date();
  const showModel = fakeModel([
    {
      id: 'show-1',
      title: 'Severance',
      overview: null,
      status: 'PUBLISHED',
      numberOfSeasons: 2,
      numberOfEpisodes: 19,
      tmdbId: 'tmdb-42',
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const repository = new PrismaTVShowRepository({ tVShow: showModel });

  const found = await repository.findByTmdbId('tmdb-42');
  assert.equal(found.title.value, 'Severance');
  assert.equal(found.seasonCount, 2);

  const missing = await repository.findByTmdbId('unknown');
  assert.equal(missing, null);
});

test('PrismaSeasonRepository.findByShowId orders by season number ascending', async () => {
  const now = new Date();
  const seasonModel = fakeModel([
    {
      id: 'season-2',
      showId: 'show-1',
      seasonNumber: 2,
      name: 'Two',
      overview: null,
      episodeCount: 5,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'season-1',
      showId: 'show-1',
      seasonNumber: 1,
      name: 'One',
      overview: null,
      episodeCount: 5,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const repository = new PrismaSeasonRepository({ season: seasonModel });

  const seasons = await repository.findByShowId('show-1');
  assert.equal(seasonModel.calls.findMany[0].orderBy.seasonNumber, 'asc');
  assert.equal(seasons.length, 2);
});

test('PrismaEpisodeRepository.findBySeasonId maps rows to Episode aggregates', async () => {
  const now = new Date();
  const episodeModel = fakeModel([
    {
      id: 'ep-1',
      seasonId: 'season-1',
      episodeNumber: 1,
      title: 'Pilot',
      overview: null,
      runtime: 45,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const repository = new PrismaEpisodeRepository({ episode: episodeModel });

  const episodes = await repository.findBySeasonId('season-1');
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].title.value, 'Pilot');
  assert.equal(episodes[0].status, 'published');
});
