import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderConfig } from '../dist/index.js';

test('createProviderConfig fills in documented defaults', () => {
  const config = createProviderConfig();

  assert.equal(config.timeoutMs, 30000);
  assert.equal(config.userAgent, 'CTV-Platform/1.0');
  assert.equal(config.maxRequestsPerInterval, 10);
  assert.equal(config.intervalMs, 1000);
  assert.equal(config.retry.maxAttempts, 3);
  assert.equal(config.retry.baseDelayMs, 500);
  assert.equal(config.retry.maxDelayMs, 10000);
  assert.equal(config.baseUrl, undefined);
});

test('createProviderConfig honors overrides', () => {
  const config = createProviderConfig({
    baseUrl: 'https://example.com',
    timeoutMs: 5000,
    maxRequestsPerInterval: 2,
    intervalMs: 500,
    retry: { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 2000 },
  });

  assert.equal(config.baseUrl, 'https://example.com');
  assert.equal(config.timeoutMs, 5000);
  assert.equal(config.maxRequestsPerInterval, 2);
  assert.equal(config.retry.maxAttempts, 5);
});

test('createProviderConfig rejects an invalid baseUrl', () => {
  assert.throws(() => createProviderConfig({ baseUrl: 'not-a-url' }));
});
