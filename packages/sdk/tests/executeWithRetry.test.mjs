import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@ctv-platform/domain';
import {
  ExponentialBackoffRetryPolicy,
  executeWithRetry,
  ProviderError,
  ProviderErrorCodeEnum,
} from '../dist/index.js';

const policy = new ExponentialBackoffRetryPolicy({
  maxAttempts: 3,
  baseDelayMs: 10,
  maxDelayMs: 50,
});
const noopDelay = async () => {};

test('returns the first successful result without retrying', async () => {
  let calls = 0;
  const result = await executeWithRetry(
    async () => {
      calls += 1;
      return ok('value');
    },
    policy,
    { delay: noopDelay },
  );

  assert.equal(calls, 1);
  assert.deepEqual(result, ok('value'));
});

test('retries a retryable failure until it succeeds', async () => {
  let calls = 0;
  const result = await executeWithRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        return err(new ProviderError(ProviderErrorCodeEnum.TIMEOUT, 'p', 'timed out'));
      }
      return ok('recovered');
    },
    policy,
    { delay: noopDelay },
  );

  assert.equal(calls, 3);
  assert.deepEqual(result, ok('recovered'));
});

test('gives up after a non-retryable failure without retrying', async () => {
  let calls = 0;
  const result = await executeWithRetry(
    async () => {
      calls += 1;
      return err(new ProviderError(ProviderErrorCodeEnum.NOT_FOUND, 'p', 'missing'));
    },
    policy,
    { delay: noopDelay },
  );

  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, ProviderErrorCodeEnum.NOT_FOUND);
});

test('gives up once maxAttempts is exhausted', async () => {
  let calls = 0;
  const result = await executeWithRetry(
    async () => {
      calls += 1;
      return err(new ProviderError(ProviderErrorCodeEnum.TIMEOUT, 'p', 'timed out'));
    },
    policy,
    { delay: noopDelay },
  );

  assert.equal(calls, 3);
  assert.equal(result.ok, false);
});

test('refreshes authentication before retrying an UNAUTHORIZED failure', async () => {
  let calls = 0;
  let refreshCalls = 0;
  const result = await executeWithRetry(
    async () => {
      calls += 1;
      if (calls === 1) {
        return err(new ProviderError(ProviderErrorCodeEnum.UNAUTHORIZED, 'p', 'expired token'));
      }
      return ok('authenticated');
    },
    policy,
    {
      delay: noopDelay,
      onRefreshAuthentication: async () => {
        refreshCalls += 1;
      },
    },
  );

  assert.equal(refreshCalls, 1);
  assert.deepEqual(result, ok('authenticated'));
});

test('invokes onRetry with the decision for every failed attempt', async () => {
  const observed = [];
  await executeWithRetry(
    async () => err(new ProviderError(ProviderErrorCodeEnum.NOT_FOUND, 'p', 'missing')),
    policy,
    {
      delay: noopDelay,
      onRetry: (decision, attempt) => observed.push({ attempt, shouldRetry: decision.shouldRetry }),
    },
  );

  assert.deepEqual(observed, [{ attempt: 1, shouldRetry: false }]);
});
