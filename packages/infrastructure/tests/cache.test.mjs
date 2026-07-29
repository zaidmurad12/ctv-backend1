import test from 'node:test';
import assert from 'node:assert/strict';
import { CacheRepository, MemoryCache, RedisCacheClient } from '../dist/index.js';

test('MemoryCache returns null for a missing key', async () => {
  const cache = new MemoryCache();
  assert.equal(await cache.get('missing'), null);
});

test('MemoryCache stores and retrieves a value', async () => {
  const cache = new MemoryCache();
  await cache.set('key', 'value');
  assert.equal(await cache.get('key'), 'value');
});

test('MemoryCache expires a value after its TTL', async () => {
  const cache = new MemoryCache();
  await cache.set('key', 'value', -1);
  assert.equal(await cache.get('key'), null);
});

test('MemoryCache.del removes a stored value', async () => {
  const cache = new MemoryCache();
  await cache.set('key', 'value');
  await cache.del('key');
  assert.equal(await cache.get('key'), null);
});

test('CacheRepository serializes and deserializes JSON values', async () => {
  const repository = new CacheRepository(new MemoryCache());
  await repository.set('movie:1', { id: '1', title: 'Arrival' });

  const value = await repository.get('movie:1');
  assert.deepEqual(value, { id: '1', title: 'Arrival' });
});

test('RedisCacheClient delegates to the underlying connection with a TTL', async () => {
  const calls = [];
  const fakeRedis = {
    async get(key) {
      calls.push(['get', key]);
      return 'cached-value';
    },
    async set(key, value, mode, ttl) {
      calls.push(['set', key, value, mode, ttl]);
    },
    async del(key) {
      calls.push(['del', key]);
    },
  };

  const client = new RedisCacheClient(fakeRedis);
  await client.set('movie:1', 'payload', 300);
  const value = await client.get('movie:1');
  await client.del('movie:1');

  assert.deepEqual(calls[0], ['set', 'movie:1', 'payload', 'EX', 300]);
  assert.deepEqual(calls[1], ['get', 'movie:1']);
  assert.deepEqual(calls[2], ['del', 'movie:1']);
  assert.equal(value, 'cached-value');
});

test('RedisCacheClient.set omits EX when no TTL is given', async () => {
  const calls = [];
  const fakeRedis = {
    async set(key, value) {
      calls.push(['set', key, value]);
    },
  };

  const client = new RedisCacheClient(fakeRedis);
  await client.set('movie:1', 'payload');

  assert.deepEqual(calls[0], ['set', 'movie:1', 'payload']);
});
