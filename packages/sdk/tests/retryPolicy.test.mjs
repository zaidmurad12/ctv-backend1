import test from 'node:test';
import assert from 'node:assert/strict';
import { ExponentialBackoffRetryPolicy, ProviderErrorCodeEnum } from '../dist/index.js';

const config = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 };

test('retries timeouts with exponentially growing delay', () => {
  const policy = new ExponentialBackoffRetryPolicy(config);

  const first = policy.decide(ProviderErrorCodeEnum.TIMEOUT, 1);
  const second = policy.decide(ProviderErrorCodeEnum.TIMEOUT, 2);

  assert.equal(first.shouldRetry, true);
  assert.equal(first.delayMs, 100);
  assert.equal(second.shouldRetry, true);
  assert.equal(second.delayMs, 200);
});

test('caps the delay at maxDelayMs', () => {
  const policy = new ExponentialBackoffRetryPolicy({
    maxAttempts: 10,
    baseDelayMs: 1000,
    maxDelayMs: 1500,
  });

  const decision = policy.decide(ProviderErrorCodeEnum.TIMEOUT, 5);

  assert.equal(decision.delayMs, 1500);
});

test('stops retrying once maxAttempts is reached', () => {
  const policy = new ExponentialBackoffRetryPolicy(config);

  const decision = policy.decide(ProviderErrorCodeEnum.TIMEOUT, 3);

  assert.equal(decision.shouldRetry, false);
  assert.equal(decision.delayMs, 0);
});

test('never retries NOT_FOUND, FORBIDDEN, INVALID_RESPONSE or NOT_SUPPORTED', () => {
  const policy = new ExponentialBackoffRetryPolicy(config);

  for (const code of [
    ProviderErrorCodeEnum.NOT_FOUND,
    ProviderErrorCodeEnum.FORBIDDEN,
    ProviderErrorCodeEnum.INVALID_RESPONSE,
    ProviderErrorCodeEnum.NOT_SUPPORTED,
  ]) {
    assert.equal(policy.decide(code, 1).shouldRetry, false, code);
  }
});

test('flags UNAUTHORIZED for authentication refresh', () => {
  const policy = new ExponentialBackoffRetryPolicy(config);

  const decision = policy.decide(ProviderErrorCodeEnum.UNAUTHORIZED, 1);

  assert.equal(decision.shouldRetry, true);
  assert.equal(decision.refreshAuthentication, true);
});

test('a custom retryable set overrides the defaults', () => {
  const policy = new ExponentialBackoffRetryPolicy(
    config,
    new Set([ProviderErrorCodeEnum.NOT_FOUND]),
  );

  assert.equal(policy.decide(ProviderErrorCodeEnum.NOT_FOUND, 1).shouldRetry, true);
  assert.equal(policy.decide(ProviderErrorCodeEnum.TIMEOUT, 1).shouldRetry, false);
});
