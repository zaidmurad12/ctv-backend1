import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseHealthCheck, HealthChecker, RedisHealthCheck } from '../dist/index.js';

test('DatabaseHealthCheck reports healthy when the query succeeds', async () => {
  const fakePrisma = { $queryRaw: async () => [{ '?column?': 1 }] };
  const check = new DatabaseHealthCheck(fakePrisma);

  assert.equal(await check.check(), true);
});

test('DatabaseHealthCheck reports unhealthy when the query throws', async () => {
  const fakePrisma = {
    $queryRaw: async () => {
      throw new Error('connection refused');
    },
  };
  const check = new DatabaseHealthCheck(fakePrisma);

  assert.equal(await check.check(), false);
});

test('RedisHealthCheck reports healthy on PONG', async () => {
  const fakeRedis = { ping: async () => 'PONG' };
  const check = new RedisHealthCheck(fakeRedis);

  assert.equal(await check.check(), true);
});

test('RedisHealthCheck reports unhealthy when ping fails', async () => {
  const fakeRedis = {
    ping: async () => {
      throw new Error('ECONNREFUSED');
    },
  };
  const check = new RedisHealthCheck(fakeRedis);

  assert.equal(await check.check(), false);
});

test('HealthChecker aggregates every registered check by name', async () => {
  const checker = new HealthChecker([
    { name: 'database', check: async () => true },
    { name: 'redis', check: async () => false },
  ]);

  const results = await checker.run();

  assert.deepEqual(results, { database: true, redis: false });
});
