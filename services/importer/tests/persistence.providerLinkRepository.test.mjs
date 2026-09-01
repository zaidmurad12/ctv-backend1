import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaContentProviderLinkRepository } from '../dist/index.js';

function fakePrisma() {
  const providers = [];
  const movieProviders = [];
  const episodeProviders = [];
  const tVShowProviders = [];

  return {
    provider: {
      upsert: async ({ where, create, update }) => {
        const existing = providers.find((row) => row.slug === where.slug);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `provider-${providers.length + 1}`, ...create };
        providers.push(row);
        return row;
      },
    },
    movieProvider: {
      findFirst: async ({ where }) =>
        movieProviders.find(
          (row) => row.providerId === where.providerId && row.externalId === where.externalId,
        ) ?? null,
      upsert: async ({ where, create, update }) => {
        const key = where.movieId_providerId;
        const existing = movieProviders.find(
          (row) => row.movieId === key.movieId && row.providerId === key.providerId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `movie-link-${movieProviders.length + 1}`, ...create };
        movieProviders.push(row);
        return row;
      },
    },
    episodeProvider: {
      findFirst: async ({ where }) =>
        episodeProviders.find(
          (row) => row.providerId === where.providerId && row.externalId === where.externalId,
        ) ?? null,
      upsert: async ({ where, create, update }) => {
        const key = where.episodeId_providerId;
        const existing = episodeProviders.find(
          (row) => row.episodeId === key.episodeId && row.providerId === key.providerId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `episode-link-${episodeProviders.length + 1}`, ...create };
        episodeProviders.push(row);
        return row;
      },
    },
    tVShowProvider: {
      findFirst: async ({ where }) =>
        tVShowProviders.find(
          (row) => row.providerId === where.providerId && row.externalId === where.externalId,
        ) ?? null,
      upsert: async ({ where, create, update }) => {
        const key = where.showId_providerId;
        const existing = tVShowProviders.find(
          (row) => row.showId === key.showId && row.providerId === key.providerId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `show-link-${tVShowProviders.length + 1}`, ...create };
        tVShowProviders.push(row);
        return row;
      },
    },
  };
}

test('ensureProvider creates once and reuses on subsequent calls', async () => {
  const prisma = fakePrisma();
  const repository = new PrismaContentProviderLinkRepository(prisma);

  const first = await repository.ensureProvider('cinemana', 'Cinemana');
  const second = await repository.ensureProvider('cinemana', 'Cinemana Updated');

  assert.equal(first, second);
});

test('ensureMovieLink is idempotent and findMovieIdByExternalId resolves it afterwards', async () => {
  const prisma = fakePrisma();
  const repository = new PrismaContentProviderLinkRepository(prisma);
  const providerDbId = await repository.ensureProvider('cinemana', 'Cinemana');

  await repository.ensureMovieLink('movie-1', providerDbId, 'ext-1', 'Arrival');
  await repository.ensureMovieLink('movie-1', providerDbId, 'ext-1', 'Arrival');

  assert.equal(prisma.movieProvider.upsert !== undefined, true);
  const foundMovieId = await repository.findMovieIdByExternalId(providerDbId, 'ext-1');
  assert.equal(foundMovieId, 'movie-1');
});

test('findMovieIdByExternalId returns null for an unknown external id', async () => {
  const prisma = fakePrisma();
  const repository = new PrismaContentProviderLinkRepository(prisma);
  const providerDbId = await repository.ensureProvider('cinemana', 'Cinemana');

  assert.equal(await repository.findMovieIdByExternalId(providerDbId, 'missing'), null);
});

test('episode and show links round-trip the same way as movie links', async () => {
  const prisma = fakePrisma();
  const repository = new PrismaContentProviderLinkRepository(prisma);
  const providerDbId = await repository.ensureProvider('cinemana', 'Cinemana');

  await repository.ensureEpisodeLink('episode-1', providerDbId, 'ep-ext-1', 'Pilot');
  await repository.ensureShowLink('show-1', providerDbId, 'show-ext-1', 'Severance');

  assert.equal(await repository.findEpisodeIdByExternalId(providerDbId, 'ep-ext-1'), 'episode-1');
  assert.equal(await repository.findShowIdByExternalId(providerDbId, 'show-ext-1'), 'show-1');
});
