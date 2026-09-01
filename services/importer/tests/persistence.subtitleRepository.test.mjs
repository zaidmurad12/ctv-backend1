import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaSubtitleRepository } from '../dist/index.js';

function fakePrisma(initial) {
  const rows = [...initial];
  return {
    rows,
    subtitle: {
      findMany: async ({ where }) =>
        rows.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value)),
      update: async ({ where, data }) => {
        const row = rows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }) => {
        const row = { id: `subtitle-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
    },
  };
}

test('reconcileForMovieLink creates a row per new subtitle URL', async () => {
  const prisma = fakePrisma([]);
  const repository = new PrismaSubtitleRepository(prisma);

  const summary = await repository.reconcileForMovieLink('link-1', [
    { language: 'en', format: 'SRT', downloadUrl: 'https://example.com/en.srt', isDefault: true },
  ]);

  assert.equal(summary.created, 1);
  assert.equal(prisma.rows[0].movieProviderId, 'link-1');
});

test('reconcileForMovieLink updates an existing subtitle with the same URL', async () => {
  const prisma = fakePrisma([
    {
      id: 'existing-1',
      movieProviderId: 'link-1',
      url: 'https://example.com/en.srt',
      language: 'en',
      format: 'SRT',
    },
  ]);
  const repository = new PrismaSubtitleRepository(prisma);

  const summary = await repository.reconcileForMovieLink('link-1', [
    { language: 'en', format: 'VTT', downloadUrl: 'https://example.com/en.srt', isDefault: true },
  ]);

  assert.equal(summary.updated, 1);
  assert.equal(prisma.rows.length, 1);
  assert.equal(prisma.rows[0].format, 'VTT');
});

test('reconcileForMovieLink never reports deactivations (Subtitle has no isActive column)', async () => {
  const prisma = fakePrisma([
    {
      id: 'existing-1',
      movieProviderId: 'link-1',
      url: 'https://example.com/gone.srt',
      language: 'en',
      format: 'SRT',
    },
  ]);
  const repository = new PrismaSubtitleRepository(prisma);

  const summary = await repository.reconcileForMovieLink('link-1', []);

  assert.equal(summary.deactivated, 0);
  assert.equal(prisma.rows.length, 1);
});
