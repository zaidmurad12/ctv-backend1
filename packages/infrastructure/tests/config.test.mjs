import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppConfig, LoggerLevel } from '../dist/index.js';

test('loads config from environment with explicit values', () => {
  const config = createAppConfig({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/ctv',
    DATABASE_POOL: '5',
    DATABASE_TIMEOUT: '15000',
    DATABASE_LOGGING: 'true',
    REDIS_HOST: 'redis.internal',
    REDIS_PORT: '6380',
    REDIS_PASSWORD: 'secret',
    REDIS_DB: '2',
    QUEUE_PREFIX: 'media',
    QUEUE_CONCURRENCY: '4',
    QUEUE_RETRY: '5',
    QUEUE_TIMEOUT: '60000',
    LOG_LEVEL: 'debug',
  });

  assert.equal(config.database.url, 'postgresql://user:pass@localhost:5432/ctv');
  assert.equal(config.database.pool, 5);
  assert.equal(config.database.timeoutMs, 15000);
  assert.equal(config.database.logging, true);
  assert.equal(config.redis.host, 'redis.internal');
  assert.equal(config.redis.port, 6380);
  assert.equal(config.redis.password, 'secret');
  assert.equal(config.redis.db, 2);
  assert.equal(config.queue.prefix, 'media');
  assert.equal(config.queue.concurrency, 4);
  assert.equal(config.queue.retry, 5);
  assert.equal(config.queue.timeoutMs, 60000);
  assert.equal(config.logging.level, LoggerLevel.Debug);
});

test('falls back to documented defaults when values are missing', () => {
  const config = createAppConfig({});

  assert.equal(config.database.pool, 20);
  assert.equal(config.database.timeoutMs, 30000);
  assert.equal(config.database.logging, false);
  assert.equal(config.redis.host, 'localhost');
  assert.equal(config.redis.port, 6379);
  assert.equal(config.redis.password, null);
  assert.equal(config.redis.db, 0);
  assert.equal(config.queue.prefix, 'ctv');
  assert.equal(config.queue.concurrency, 10);
  assert.equal(config.logging.level, LoggerLevel.Info);
});

test('rejects an invalid DATABASE_URL', () => {
  assert.throws(() => createAppConfig({ DATABASE_URL: 'not-a-url' }));
});
