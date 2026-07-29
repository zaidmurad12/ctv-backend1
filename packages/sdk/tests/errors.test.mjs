import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderAlreadyRegisteredError,
  ProviderError,
  ProviderErrorCodeEnum,
  ProviderNotRegisteredError,
} from '../dist/index.js';

test('ProviderError carries code, providerId and optional retryAfterMs', () => {
  const error = new ProviderError(
    ProviderErrorCodeEnum.RATE_LIMITED,
    'cinemana',
    'Too many requests',
    {
      retryAfterMs: 2000,
    },
  );

  assert.equal(error.name, 'ProviderError');
  assert.equal(error.code, ProviderErrorCodeEnum.RATE_LIMITED);
  assert.equal(error.providerId, 'cinemana');
  assert.equal(error.retryAfterMs, 2000);
  assert.ok(error instanceof Error);
});

test('ProviderError defaults retryAfterMs to null', () => {
  const error = new ProviderError(ProviderErrorCodeEnum.NOT_FOUND, 'tmdb', 'Missing');
  assert.equal(error.retryAfterMs, null);
});

test('ProviderAlreadyRegisteredError names the offending provider', () => {
  const error = new ProviderAlreadyRegisteredError('cinemana');
  assert.match(error.message, /cinemana/);
  assert.equal(error.name, 'ProviderAlreadyRegisteredError');
});

test('ProviderNotRegisteredError names the missing provider', () => {
  const error = new ProviderNotRegisteredError('unknown-provider');
  assert.match(error.message, /unknown-provider/);
  assert.equal(error.name, 'ProviderNotRegisteredError');
});
