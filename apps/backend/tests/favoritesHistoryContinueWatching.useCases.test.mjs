import test from 'node:test';
import assert from 'node:assert/strict';
import { FavoritesUseCases } from '../dist/favorites/useCases.js';
import { WatchHistoryUseCases } from '../dist/watch-history/useCases.js';
import { ContinueWatchingUseCases } from '../dist/continue-watching/useCases.js';

test('FavoritesUseCases.add rejects when neither movieId nor showId is given', async () => {
  const useCases = new FavoritesUseCases({ add: async () => 'id' });
  await assert.rejects(() => useCases.add('u1', {}));
});

test('FavoritesUseCases.add rejects when both movieId and showId are given', async () => {
  const useCases = new FavoritesUseCases({ add: async () => 'id' });
  await assert.rejects(() => useCases.add('u1', { movieId: 'm1', showId: 's1' }));
});

test('FavoritesUseCases.add succeeds with exactly one id', async () => {
  const calls = [];
  const useCases = new FavoritesUseCases({ add: async (userId, movieId, showId) => (calls.push([userId, movieId, showId]), 'fav-1') });
  const id = await useCases.add('u1', { movieId: 'm1' });
  assert.equal(id, 'fav-1');
  assert.deepEqual(calls[0], ['u1', 'm1', undefined]);
});

test('FavoritesUseCases.remove throws NotFoundException when nothing was removed', async () => {
  const useCases = new FavoritesUseCases({ remove: async () => 0 });
  await assert.rejects(() => useCases.remove('u1', 'missing'));
});

test('WatchHistoryUseCases.record rejects when both movieId and episodeId are given', async () => {
  const useCases = new WatchHistoryUseCases({ record: async () => 'id' });
  await assert.rejects(() => useCases.record('u1', { movieId: 'm1', episodeId: 'e1', position: 0, duration: 0 }));
});

test('WatchHistoryUseCases.record succeeds with exactly one id', async () => {
  const useCases = new WatchHistoryUseCases({ record: async () => 'history-1' });
  const id = await useCases.record('u1', { episodeId: 'e1', position: 10, duration: 100 });
  assert.equal(id, 'history-1');
});

test('ContinueWatchingUseCases.upsert rejects when neither id is given', async () => {
  const useCases = new ContinueWatchingUseCases({ upsert: async () => 'id' });
  await assert.rejects(() => useCases.upsert('u1', { position: 0 }));
});

test('ContinueWatchingUseCases.upsert succeeds with exactly one id', async () => {
  const useCases = new ContinueWatchingUseCases({ upsert: async () => 'cw-1' });
  const id = await useCases.upsert('u1', { movieId: 'm1', position: 42 });
  assert.equal(id, 'cw-1');
});
