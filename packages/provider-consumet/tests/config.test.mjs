import test from 'node:test';
import assert from 'node:assert/strict';
import { readConsumetEnv, isConsumetEnabled } from '../dist/index.js';

test('defaults to disabled when no env vars are set', () => {
  const config = readConsumetEnv({});
  assert.equal(config.enabled, false);
  assert.equal(config.source, 'flixhq');
  assert.equal(config.priority, 50);
});

test('parses a fully-specified environment', () => {
  const config = readConsumetEnv({
    PROVIDER_CONSUMET_ENABLED: 'true',
    PROVIDER_CONSUMET_BASE_URL: 'https://consumet.example.com',
    PROVIDER_CONSUMET_SOURCE: 'dramacool',
    PROVIDER_CONSUMET_PRIORITY: '5',
    PROVIDER_CONSUMET_TIMEOUT_MS: '5000',
    PROVIDER_CONSUMET_MAX_RPS: '3',
    PROVIDER_CONSUMET_CACHE_TTL_SECONDS: '60',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://consumet.example.com',
    source: 'dramacool',
    priority: 5,
    timeoutMs: 5000,
    maxRequestsPerSecond: 3,
    cacheTtlSeconds: 60,
  });
});

test('isConsumetEnabled mirrors the enabled flag', () => {
  assert.equal(isConsumetEnabled({ PROVIDER_CONSUMET_ENABLED: 'true' }), true);
  assert.equal(isConsumetEnabled({}), false);
});
