import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@ctv-platform/domain';
import { InMemoryQueueClient } from '@ctv-platform/infrastructure';
import { DiscoveryModeEnum, DiscoveryWorker, ImportLogger, ImportQueues } from '../dist/index.js';

function fakeLogger() {
  const calls = [];
  return {
    calls,
    logger: {
      debug() {},
      info: (m, meta) => calls.push(['info', m, meta]),
      warn() {},
      error: (m, meta) => calls.push(['error', m, meta]),
    },
  };
}

test('DiscoveryWorker enqueues one import job per discovered item', async () => {
  const discoveryQueue = new InMemoryQueueClient();
  const importQueue = new InMemoryQueueClient();
  const queues = new ImportQueues(discoveryQueue, importQueue);
  const registry = { resolve: () => ({ metadata: { id: 'cinemana' } }) };
  const discoveryEngine = {
    run: async () =>
      ok({
        items: [
          { providerContentId: 'c-1', kind: 'movie', title: 'A', artwork: {} },
          { providerContentId: 'c-2', kind: 'show', title: 'B', artwork: {} },
        ],
        discoveredAt: new Date(),
      }),
  };
  const { logger } = fakeLogger();
  const worker = new DiscoveryWorker(registry, discoveryEngine, queues, new ImportLogger(logger));

  await queues.enqueueDiscovery({ providerId: 'cinemana', mode: DiscoveryModeEnum.MANUAL });
  await worker.start();

  const importedPayloads = [];
  await queues.processImport(async (job) => importedPayloads.push(job.payload));

  assert.deepEqual(
    importedPayloads.map((payload) => [payload.providerContentId, payload.category]),
    [
      ['c-1', 'movie'],
      ['c-2', 'show'],
    ],
  );
});

test('DiscoveryWorker logs a failure and enqueues nothing when discovery fails', async () => {
  const discoveryQueue = new InMemoryQueueClient();
  const importQueue = new InMemoryQueueClient();
  const queues = new ImportQueues(discoveryQueue, importQueue);
  const registry = { resolve: () => ({ metadata: { id: 'cinemana' } }) };
  const discoveryEngine = { run: async () => err({ message: 'unreachable' }) };
  const { calls, logger } = fakeLogger();
  const worker = new DiscoveryWorker(registry, discoveryEngine, queues, new ImportLogger(logger));

  await queues.enqueueDiscovery({ providerId: 'cinemana', mode: DiscoveryModeEnum.SCHEDULED });
  await worker.start();

  const importedPayloads = [];
  await queues.processImport(async (job) => importedPayloads.push(job.payload));

  assert.equal(importedPayloads.length, 0);
  assert.equal(calls[0][0], 'error');
});
