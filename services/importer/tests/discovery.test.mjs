import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@ctv-platform/domain';
import { ProviderCapabilityEnum } from '@ctv-platform/sdk';
import {
  DiscoveryEngine,
  DiscoveryModeEnum,
  InMemoryDiscoveryCheckpointStore,
} from '../dist/index.js';

function fakeProvider(capabilities, discoverImpl) {
  return {
    metadata: { id: 'cinemana', name: 'Cinemana', capabilities },
    supports: (capability) => capabilities.includes(capability),
    discover: discoverImpl,
  };
}

test('InMemoryDiscoveryCheckpointStore returns null before any checkpoint is set', async () => {
  const store = new InMemoryDiscoveryCheckpointStore();
  assert.equal(await store.getLastDiscoveredAt('cinemana'), null);
});

test('InMemoryDiscoveryCheckpointStore round-trips a checkpoint', async () => {
  const store = new InMemoryDiscoveryCheckpointStore();
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  await store.setLastDiscoveredAt('cinemana', timestamp);
  assert.equal((await store.getLastDiscoveredAt('cinemana')).getTime(), timestamp.getTime());
});

test('DiscoveryEngine rejects a provider that does not support discovery', async () => {
  const engine = new DiscoveryEngine(new InMemoryDiscoveryCheckpointStore());
  const provider = fakeProvider([], async () => ok({ items: [], totalCount: 0 }));

  const result = await engine.run(provider, DiscoveryModeEnum.INCREMENTAL);

  assert.equal(result.ok, false);
});

test('DiscoveryEngine incremental mode only scans one page of the "what is new" categories', async () => {
  const calls = [];
  const provider = fakeProvider([ProviderCapabilityEnum.DISCOVERY], async (query) => {
    calls.push(query);
    return ok({
      items: [{ providerContentId: `${query.category}-1`, kind: 'movie', title: 'X', artwork: {} }],
      totalCount: 1,
    });
  });
  const engine = new DiscoveryEngine(new InMemoryDiscoveryCheckpointStore());

  const result = await engine.run(provider, DiscoveryModeEnum.INCREMENTAL);

  assert.equal(result.ok, true);
  assert.deepEqual(
    calls.map((call) => call.category),
    ['newest', 'latest_shows', 'latest_episodes'],
  );
  assert.equal(result.value.items.length, 3);
});

test('DiscoveryEngine deduplicates items seen across categories/pages', async () => {
  const provider = fakeProvider([ProviderCapabilityEnum.DISCOVERY], async () =>
    ok({
      items: [{ providerContentId: 'dupe', kind: 'movie', title: 'X', artwork: {} }],
      totalCount: 1,
    }),
  );
  const engine = new DiscoveryEngine(new InMemoryDiscoveryCheckpointStore());

  const result = await engine.run(provider, DiscoveryModeEnum.INCREMENTAL);

  assert.equal(result.value.items.length, 1);
});

test('DiscoveryEngine stops paginating once a page returns fewer items than the total count implies', async () => {
  let pageCalls = 0;
  const provider = fakeProvider([ProviderCapabilityEnum.DISCOVERY], async (query) => {
    if (query.category !== 'newest') {
      return ok({ items: [], totalCount: 0 });
    }
    pageCalls += 1;
    if (query.page === 1) {
      return ok({
        items: [{ providerContentId: 'a', kind: 'movie', title: 'A', artwork: {} }],
        totalCount: 2,
      });
    }
    return ok({
      items: [{ providerContentId: 'b', kind: 'movie', title: 'B', artwork: {} }],
      totalCount: 2,
    });
  });
  const engine = new DiscoveryEngine(new InMemoryDiscoveryCheckpointStore());

  const result = await engine.run(provider, DiscoveryModeEnum.FULL);

  assert.equal(result.ok, true);
  assert.equal(pageCalls, 2);
});

test('DiscoveryEngine propagates a provider error and updates no checkpoint', async () => {
  const checkpoints = new InMemoryDiscoveryCheckpointStore();
  const provider = fakeProvider([ProviderCapabilityEnum.DISCOVERY], async () =>
    err({ code: 'TIMEOUT', message: 'timed out' }),
  );
  const engine = new DiscoveryEngine(checkpoints);

  const result = await engine.run(provider, DiscoveryModeEnum.INCREMENTAL);

  assert.equal(result.ok, false);
  assert.equal(await checkpoints.getLastDiscoveredAt('cinemana'), null);
});
