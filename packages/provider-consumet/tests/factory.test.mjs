import test from 'node:test';
import assert from 'node:assert/strict';
import { ConsumetProviderFactory, ConsumetProvider } from '../dist/index.js';

test('factory builds a ConsumetProvider carrying the configured priority, with no network calls at construction time', () => {
  const factory = new ConsumetProviderFactory({
    enabled: true,
    baseUrl: 'https://consumet.example.com',
    source: 'flixhq',
    priority: 42,
    timeoutMs: 5000,
    maxRequestsPerSecond: 2,
    cacheTtlSeconds: 60,
  });

  assert.equal(factory.providerId, 'consumet');

  const provider = factory.create();
  assert.ok(provider instanceof ConsumetProvider);
  assert.equal(provider.metadata.id, 'consumet');
  assert.equal(provider.metadata.priority, 42);
});
