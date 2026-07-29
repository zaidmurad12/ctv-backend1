import test from 'node:test';
import assert from 'node:assert/strict';
import { err, ok } from '@ctv-platform/domain';
import { InMemoryQueueClient } from '@ctv-platform/infrastructure';
import {
  DeadLetterQueue,
  ImportError,
  ImportFailureCategoryEnum,
  ImportLogger,
  ImportMetrics,
  ImportPriorityEnum,
  ImportQueues,
  ImportWorker,
  JobRetryPolicy,
} from '../dist/index.js';

function noopLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function buildWorker(
  orchestrator,
  retryConfig = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
) {
  const importQueue = new InMemoryQueueClient();
  const queues = new ImportQueues(new InMemoryQueueClient(), importQueue);
  const dlq = new DeadLetterQueue();
  const metrics = new ImportMetrics();
  const registry = { resolve: () => ({ metadata: { id: 'cinemana' } }) };
  const worker = new ImportWorker(
    registry,
    orchestrator,
    queues,
    new JobRetryPolicy(retryConfig),
    dlq,
    metrics,
    new ImportLogger(noopLogger()),
    async () => {},
  );
  return { worker, queues, dlq, metrics };
}

test('a successful import records metrics and requeues nothing', async () => {
  const orchestrator = { importOne: async () => ok({ contentId: 'm1', linkId: 'l1' }) };
  const { worker, queues, metrics } = buildWorker(orchestrator);

  await queues.enqueueImport({
    providerId: 'cinemana',
    providerContentId: 'c-1',
    category: 'movie',
    priority: ImportPriorityEnum.HIGH,
    attempt: 1,
  });
  await worker.start();

  assert.equal(metrics.snapshot().moviesImported, 1);
  assert.equal(metrics.snapshot().failedImports, 0);
});

test('a retryable failure is requeued with an incremented attempt count until it eventually succeeds', async () => {
  let calls = 0;
  const orchestrator = {
    importOne: async () => {
      calls += 1;
      if (calls < 2) {
        return err(new ImportError(ImportFailureCategoryEnum.TIMEOUT, 'movie-import', 'timed out'));
      }
      return ok({ contentId: 'm1', linkId: 'l1' });
    },
  };
  const { worker, queues, metrics, dlq } = buildWorker(orchestrator);

  await queues.enqueueImport({
    providerId: 'cinemana',
    providerContentId: 'c-1',
    category: 'movie',
    priority: ImportPriorityEnum.HIGH,
    attempt: 1,
  });
  await worker.start();

  assert.equal(calls, 2);
  assert.equal(metrics.snapshot().retriedImports, 1);
  assert.equal(dlq.size, 0);
});

test('a non-retryable validation failure goes straight to the dead letter queue', async () => {
  const orchestrator = {
    importOne: async () =>
      err(
        new ImportError(
          ImportFailureCategoryEnum.VALIDATION_ERROR,
          'movie-import',
          'no valid streams',
        ),
      ),
  };
  const { worker, queues, dlq } = buildWorker(orchestrator);

  await queues.enqueueImport({
    providerId: 'cinemana',
    providerContentId: 'c-1',
    category: 'movie',
    priority: ImportPriorityEnum.HIGH,
    attempt: 1,
  });
  await worker.start();

  assert.equal(dlq.size, 1);
  assert.match(dlq.list()[0].error, /no valid streams/);
});

test('a retryable failure that exhausts maxAttempts lands in the dead letter queue', async () => {
  const orchestrator = {
    importOne: async () =>
      err(new ImportError(ImportFailureCategoryEnum.TIMEOUT, 'movie-import', 'always times out')),
  };
  const { worker, queues, dlq } = buildWorker(orchestrator, {
    maxAttempts: 2,
    baseDelayMs: 1,
    maxDelayMs: 5,
  });

  await queues.enqueueImport({
    providerId: 'cinemana',
    providerContentId: 'c-1',
    category: 'movie',
    priority: ImportPriorityEnum.HIGH,
    attempt: 1,
  });
  await worker.start();

  assert.equal(dlq.size, 1);
  assert.equal(dlq.list()[0].attempts, 2);
});
