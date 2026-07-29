import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryQueueClient } from '@ctv-platform/infrastructure';
import { DiscoveryModeEnum, ImportPriorityEnum, ImportQueues } from '../dist/index.js';

test('ImportQueues routes discovery and import jobs to their own queues', async () => {
  const discoveryQueue = new InMemoryQueueClient();
  const importQueue = new InMemoryQueueClient();
  const queues = new ImportQueues(discoveryQueue, importQueue);

  await queues.enqueueDiscovery({ providerId: 'cinemana', mode: DiscoveryModeEnum.SCHEDULED });
  await queues.enqueueImport({
    providerId: 'cinemana',
    providerContentId: 'c-1',
    category: 'movie',
    priority: ImportPriorityEnum.HIGH,
    attempt: 1,
  });

  const discoveryJobs = [];
  const importJobs = [];
  await queues.processDiscovery(async (job) => discoveryJobs.push(job.payload));
  await queues.processImport(async (job) => importJobs.push(job.payload));

  assert.equal(discoveryJobs.length, 1);
  assert.equal(discoveryJobs[0].providerId, 'cinemana');
  assert.equal(importJobs.length, 1);
  assert.equal(importJobs[0].providerContentId, 'c-1');
});
