import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryQueueClient, QueueManager } from '../dist/index.js';

test('InMemoryQueueClient processes enqueued jobs in FIFO order', async () => {
  const client = new InMemoryQueueClient();
  const processed = [];

  await client.enqueue({ id: '1', payload: 'first' });
  await client.enqueue({ id: '2', payload: 'second' });

  await client.process(async (job) => {
    processed.push(job.payload);
  });

  assert.deepEqual(processed, ['first', 'second']);
});

test('QueueManager delegates enqueue and process to the underlying client', async () => {
  const client = new InMemoryQueueClient();
  const manager = new QueueManager(client);
  const processed = [];

  await manager.enqueue({ id: '1', payload: 'job-payload' });
  await manager.process(async (job) => {
    processed.push(job.id);
  });

  assert.deepEqual(processed, ['1']);
});
