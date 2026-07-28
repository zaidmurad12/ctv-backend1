import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppConfig, createContainer, LoggerLevel } from '../dist/index.js';

test('load config from environment', () => {
  const config = createAppConfig({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/ctv',
    REDIS_URL: 'redis://localhost:6379',
    QUEUE_NAME: 'media-jobs',
    LOG_LEVEL: 'debug',
  });

  assert.equal(config.database.url, 'postgresql://user:pass@localhost:5432/ctv');
  assert.equal(config.redis.url, 'redis://localhost:6379');
  assert.equal(config.queue.name, 'media-jobs');
  assert.equal(config.logging.level, LoggerLevel.Debug);
});

test('container resolves singleton services', () => {
  const container = createContainer();
  container.registerSingleton('counter', class Counter { constructor() { this.value = 0; } increment() { this.value += 1; return this.value; } });

  const first = container.resolve('counter');
  const second = container.resolve('counter');

  assert.equal(first.increment(), 1);
  assert.equal(second.increment(), 2);
});
