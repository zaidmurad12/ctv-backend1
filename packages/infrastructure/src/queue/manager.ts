export interface QueueJob<T = unknown> {
  id: string;
  payload: T;
}

export interface QueueClient {
  enqueue<T>(job: QueueJob<T>): Promise<void>;
  process<T>(handler: (job: QueueJob<T>) => Promise<void>): Promise<void>;
}

export class InMemoryQueueClient implements QueueClient {
  private readonly jobs: QueueJob[] = [];

  async enqueue<T>(job: QueueJob<T>): Promise<void> {
    this.jobs.push(job as QueueJob);
  }

  async process<T>(handler: (job: QueueJob<T>) => Promise<void>): Promise<void> {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (job) {
        await handler(job as QueueJob<T>);
      }
    }
  }
}

export class QueueManager {
  constructor(private readonly queue: QueueClient) {}

  async enqueue<T>(job: QueueJob<T>): Promise<void> {
    await this.queue.enqueue(job);
  }

  async process<T>(handler: (job: QueueJob<T>) => Promise<void>): Promise<void> {
    await this.queue.process(handler);
  }
}
