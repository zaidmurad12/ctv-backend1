import { Queue, Worker } from 'bullmq';
import type { QueueConfig } from '../config/env.js';
import type { RedisConnection } from '../redis/client.js';
import type { QueueClient, QueueJob } from './manager.js';

/**
 * BullMQ-backed queue client used in every environment except unit tests.
 * One instance owns exactly one named queue.
 */
export class BullMQQueueClient implements QueueClient {
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    private readonly name: string,
    private readonly connection: RedisConnection,
    private readonly config: QueueConfig,
  ) {
    this.queue = new Queue(name, { connection: this.connection, prefix: this.config.prefix });
  }

  async enqueue<T>(job: QueueJob<T>): Promise<void> {
    await this.queue.add(job.id, job.payload, {
      jobId: job.id,
      attempts: this.config.retry + 1,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  async process<T>(handler: (job: QueueJob<T>) => Promise<void>): Promise<void> {
    this.worker = new Worker(
      this.name,
      async (job) => {
        await handler({ id: job.id ?? job.name, payload: job.data as T });
      },
      {
        connection: this.connection,
        prefix: this.config.prefix,
        concurrency: this.config.concurrency,
      },
    );
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
