import type { QueueClient, QueueJob } from '@ctv-platform/infrastructure';
import type { DiscoveryJobPayload, ImportContentJobPayload } from '../jobs/importJobs.js';

/**
 * Wires the two real queues this pipeline needs on top of the `QueueClient`
 * port reused directly from `@ctv-platform/infrastructure` (in-memory in
 * tests/dev, BullMQ in production): Discovery Queue and Import Queue. Fan-out
 * into the finer-grained queues named in specification/08-Import-Pipeline.md.txt
 * (movie/TV/stream/subtitle/TMDB/artwork/validation/search) is a scaling
 * optimization left for Milestone 8; here every stage after discovery runs
 * in-process within a single import job, which is correct and simpler to
 * operate for a first production-ready pipeline.
 */
export class ImportQueues {
  constructor(
    private readonly discoveryQueue: QueueClient,
    private readonly importQueue: QueueClient,
  ) {}

  enqueueDiscovery(payload: DiscoveryJobPayload): Promise<void> {
    return this.discoveryQueue.enqueue<DiscoveryJobPayload>({
      id: `discovery:${payload.providerId}:${payload.mode}:${Date.now()}`,
      payload,
    });
  }

  enqueueImport(payload: ImportContentJobPayload): Promise<void> {
    return this.importQueue.enqueue<ImportContentJobPayload>({
      id: `import:${payload.providerId}:${payload.providerContentId}`,
      payload,
    });
  }

  processDiscovery(handler: (job: QueueJob<DiscoveryJobPayload>) => Promise<void>): Promise<void> {
    return this.discoveryQueue.process(handler);
  }

  processImport(handler: (job: QueueJob<ImportContentJobPayload>) => Promise<void>): Promise<void> {
    return this.importQueue.process(handler);
  }
}
