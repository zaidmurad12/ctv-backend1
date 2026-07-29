import test from 'node:test';
import assert from 'node:assert/strict';
import { isOk } from '@ctv-platform/domain';
import { NoopAuthenticationStrategy } from '../dist/index.js';

test('NoopAuthenticationStrategy always authenticates successfully with no credentials', async () => {
  const strategy = new NoopAuthenticationStrategy();

  const result = await strategy.authenticate();

  assert.equal(isOk(result), true);
  assert.equal(result.value, null);
});

test('NoopAuthenticationStrategy credentials never expire', () => {
  const strategy = new NoopAuthenticationStrategy();

  assert.equal(strategy.isExpired(null), false);
});
