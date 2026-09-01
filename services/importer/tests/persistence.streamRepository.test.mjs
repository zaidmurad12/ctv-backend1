import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaStreamRepository } from '../dist/index.js';

function fakePrisma(initialStreams) {
  const streams = [...initialStreams];
  return {
    rows: streams,
    stream: {
      findMany: async ({ where }) =>
        streams.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value)),
      update: async ({ where, data }) => {
        const row = streams.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }) => {
        const row = { id: `stream-${streams.length + 1}`, isActive: true, ...data };
        streams.push(row);
        return row;
      },
    },
  };
}

test('reconcileForMovieLink creates new rows for unseen URLs', async () => {
  const prisma = fakePrisma([]);
  const repository = new PrismaStreamRepository(prisma);

  const summary = await repository.reconcileForMovieLink('link-1', [
    { quality: '1080p', serverName: 'A', playbackUrl: 'https://example.com/1', isDefault: true },
  ]);

  assert.equal(summary.created, 1);
  assert.equal(summary.updated, 0);
  assert.equal(summary.deactivated, 0);
  assert.equal(prisma.rows[0].movieProviderId, 'link-1');
});

test('reconcileForMovieLink updates an existing row with the same streamUrl instead of duplicating it', async () => {
  const prisma = fakePrisma([
    {
      id: 'existing-1',
      movieProviderId: 'link-1',
      streamUrl: 'https://example.com/1',
      quality: '720p',
      isActive: true,
    },
  ]);
  const repository = new PrismaStreamRepository(prisma);

  const summary = await repository.reconcileForMovieLink('link-1', [
    { quality: '1080p', serverName: 'A', playbackUrl: 'https://example.com/1', isDefault: true },
  ]);

  assert.equal(summary.created, 0);
  assert.equal(summary.updated, 1);
  assert.equal(prisma.rows.length, 1);
  assert.equal(prisma.rows[0].quality, '1080p');
});

test('reconcileForMovieLink deactivates rows whose URL disappeared, without deleting them', async () => {
  const prisma = fakePrisma([
    {
      id: 'existing-1',
      movieProviderId: 'link-1',
      streamUrl: 'https://example.com/gone',
      quality: '720p',
      isActive: true,
    },
  ]);
  const repository = new PrismaStreamRepository(prisma);

  const summary = await repository.reconcileForMovieLink('link-1', []);

  assert.equal(summary.deactivated, 1);
  assert.equal(prisma.rows.length, 1);
  assert.equal(prisma.rows[0].isActive, false);
});

test('reconcileForEpisodeLink scopes rows by episodeProviderId', async () => {
  const prisma = fakePrisma([]);
  const repository = new PrismaStreamRepository(prisma);

  await repository.reconcileForEpisodeLink('ep-link-1', [
    { quality: '1080p', serverName: 'A', playbackUrl: 'https://example.com/e1', isDefault: true },
  ]);

  assert.equal(prisma.rows[0].episodeProviderId, 'ep-link-1');
});
