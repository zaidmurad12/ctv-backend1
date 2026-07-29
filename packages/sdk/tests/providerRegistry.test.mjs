import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderAlreadyRegisteredError,
  ProviderCapabilityEnum,
  ProviderNotRegisteredError,
  ProviderRegistry,
} from '../dist/index.js';

function fakeProvider(id, priority, capabilities = []) {
  return {
    metadata: {
      id,
      name: id,
      version: '1.0.0',
      apiVersion: '1',
      minimumSupportedVersion: '1',
      priority,
      capabilities,
    },
    supports: (capability) => capabilities.includes(capability),
  };
}

test('register then resolve returns the same instance', () => {
  const registry = new ProviderRegistry();
  const provider = fakeProvider('cinemana', 1);

  registry.register(provider);

  assert.equal(registry.resolve('cinemana'), provider);
});

test('registering the same provider id twice throws', () => {
  const registry = new ProviderRegistry();
  registry.register(fakeProvider('cinemana', 1));

  assert.throws(
    () => registry.register(fakeProvider('cinemana', 1)),
    ProviderAlreadyRegisteredError,
  );
});

test('resolving an unregistered provider id throws', () => {
  const registry = new ProviderRegistry();

  assert.throws(() => registry.resolve('missing'), ProviderNotRegisteredError);
});

test('tryResolve returns null instead of throwing for an unknown id', () => {
  const registry = new ProviderRegistry();

  assert.equal(registry.tryResolve('missing'), null);
});

test('registerFactory instantiates lazily and caches the singleton', () => {
  const registry = new ProviderRegistry();
  let creations = 0;
  registry.registerFactory({
    providerId: 'tmdb',
    create: () => {
      creations += 1;
      return fakeProvider('tmdb', 2);
    },
  });

  assert.equal(creations, 0);
  const first = registry.resolve('tmdb');
  const second = registry.resolve('tmdb');

  assert.equal(creations, 1);
  assert.equal(first, second);
});

test('list() sorts providers by ascending priority', () => {
  const registry = new ProviderRegistry();
  registry.register(fakeProvider('low-priority', 10));
  registry.register(fakeProvider('cinemana', 1));
  registry.register(fakeProvider('tmdb', 2));

  const ids = registry.list().map((provider) => provider.metadata.id);

  assert.deepEqual(ids, ['cinemana', 'tmdb', 'low-priority']);
});

test('listByCapability filters providers that advertise the capability', () => {
  const registry = new ProviderRegistry();
  registry.register(fakeProvider('cinemana', 1, [ProviderCapabilityEnum.STREAMS]));
  registry.register(fakeProvider('tmdb', 2, [ProviderCapabilityEnum.METADATA_ENRICHMENT]));

  const streamProviders = registry.listByCapability(ProviderCapabilityEnum.STREAMS);

  assert.deepEqual(
    streamProviders.map((provider) => provider.metadata.id),
    ['cinemana'],
  );
});

test('unregister removes both eager instances and factories', () => {
  const registry = new ProviderRegistry();
  registry.register(fakeProvider('cinemana', 1));

  registry.unregister('cinemana');

  assert.equal(registry.isRegistered('cinemana'), false);
  assert.throws(() => registry.resolve('cinemana'), ProviderNotRegisteredError);
});
