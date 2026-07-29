import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryQueueClient } from '@ctv-platform/infrastructure';
import { ProviderCapabilityEnum, ProviderRegistry } from '@ctv-platform/sdk';
import { DiscoveryModeEnum, ImportQueues, ImportScheduler } from '../dist/index.js';

function fakeProvider(id, capabilities) {
  return {
    metadata: { id, name: id, capabilities },
    supports: (capability) => capabilities.includes(capability),
  };
}

function fakeClock() {
  let handler = null;
  return {
    clock: {
      setInterval: (fn) => {
        handler = fn;
        return 'timer-handle';
      },
      clearInterval: () => {
        handler = null;
      },
    },
    tick: () => handler?.(),
  };
}

function buildQueues() {
  return new ImportQueues(new InMemoryQueueClient(), new InMemoryQueueClient());
}

test('start() schedules a discovery run for every provider with the discovery capability', async () => {
  const registry = new ProviderRegistry();
  registry.register(fakeProvider('cinemana', [ProviderCapabilityEnum.DISCOVERY]));
  registry.register(fakeProvider('tmdb', [ProviderCapabilityEnum.METADATA_ENRICHMENT]));
  const queues = buildQueues();
  const { clock, tick } = fakeClock();
  const scheduler = new ImportScheduler(registry, queues, 1000, clock);

  scheduler.start();
  tick();
  await new Promise((resolve) => setImmediate(resolve));

  const jobs = [];
  await queues.processDiscovery(async (job) => jobs.push(job.payload));

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].providerId, 'cinemana');
  assert.equal(jobs[0].mode, DiscoveryModeEnum.SCHEDULED);
});

test('stop() clears the underlying interval exactly once even if called twice', () => {
  const registry = new ProviderRegistry();
  const queues = buildQueues();
  let clearCalls = 0;
  const clock = {
    setInterval: () => 'timer-handle',
    clearInterval: () => {
      clearCalls += 1;
    },
  };
  const scheduler = new ImportScheduler(registry, queues, 1000, clock);

  scheduler.start();
  scheduler.stop();
  scheduler.stop();

  assert.equal(clearCalls, 1);
});

test('start() is idempotent: calling it twice only registers one interval', () => {
  const registry = new ProviderRegistry();
  const queues = buildQueues();
  let setIntervalCalls = 0;
  const clock = {
    setInterval: () => {
      setIntervalCalls += 1;
      return 'timer-handle';
    },
    clearInterval: () => {},
  };
  const scheduler = new ImportScheduler(registry, queues, 1000, clock);

  scheduler.start();
  scheduler.start();

  assert.equal(setIntervalCalls, 1);
});

test('triggerManualDiscovery/Incremental/Full enqueue the right discovery mode', async () => {
  const registry = new ProviderRegistry();
  const queues = buildQueues();
  const scheduler = new ImportScheduler(registry, queues, 1000);

  await scheduler.triggerManualDiscovery('cinemana');
  await scheduler.triggerIncrementalDiscovery('cinemana');
  await scheduler.triggerFullDiscovery('cinemana');

  const jobs = [];
  await queues.processDiscovery(async (job) => jobs.push(job.payload.mode));

  assert.deepEqual(jobs, [
    DiscoveryModeEnum.MANUAL,
    DiscoveryModeEnum.INCREMENTAL,
    DiscoveryModeEnum.FULL,
  ]);
});
