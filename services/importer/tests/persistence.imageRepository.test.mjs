import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaImageRepository } from '../dist/index.js';

function fakePrisma(initial) {
  const rows = [...initial];
  return {
    rows,
    image: {
      findFirst: async ({ where }) =>
        rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ??
        null,
      update: async ({ where, data }) => {
        const row = rows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }) => {
        const row = { id: `image-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
    },
  };
}

test('reconcileForMovie creates one row per artwork kind', async () => {
  const prisma = fakePrisma([]);
  const repository = new PrismaImageRepository(prisma);

  const summary = await repository.reconcileForMovie('movie-1', [
    { kind: 'poster', url: 'https://example.com/p.jpg', provider: 'cinemana' },
    { kind: 'backdrop', url: 'https://example.com/b.jpg', provider: 'cinemana' },
  ]);

  assert.equal(summary.created, 2);
  assert.equal(prisma.rows.find((row) => row.type === 'POSTER').movieId, 'movie-1');
});

test('reconcileForMovie updates the existing slot for a kind instead of duplicating it', async () => {
  const prisma = fakePrisma([
    {
      id: 'existing-1',
      movieId: 'movie-1',
      type: 'POSTER',
      url: 'https://old.example.com/p.jpg',
      provider: 'cinemana',
    },
  ]);
  const repository = new PrismaImageRepository(prisma);

  const summary = await repository.reconcileForMovie('movie-1', [
    { kind: 'poster', url: 'https://tmdb.example.com/p.jpg', provider: 'tmdb' },
  ]);

  assert.equal(summary.updated, 1);
  assert.equal(prisma.rows.length, 1);
  assert.equal(prisma.rows[0].url, 'https://tmdb.example.com/p.jpg');
  assert.equal(prisma.rows[0].provider, 'tmdb');
});

test('reconcileForShow uses showId instead of movieId', async () => {
  const prisma = fakePrisma([]);
  const repository = new PrismaImageRepository(prisma);

  await repository.reconcileForShow('show-1', [
    { kind: 'logo', url: 'https://example.com/l.png', provider: 'cinemana' },
  ]);

  assert.equal(prisma.rows[0].showId, 'show-1');
  assert.equal(prisma.rows[0].type, 'LOGO');
});
