import { isOk } from '@ctv-platform/domain';
import type { ProviderRegistry } from '@ctv-platform/sdk';
import type { DiscoveryEngine } from '../discovery/discoveryEngine.js';
import { ImportPriorityEnum } from '../enums.js';
import type { DiscoveryJobPayload, ImportContentJobPayload } from '../jobs/importJobs.js';
import type { ImportLogger } from '../operations/importLogger.js';
import type { ImportQueues } from '../queues/importQueues.js';

/**
 * Consumes the Discovery Queue: runs discovery for the requested provider,
 * then enqueues one Import job per discovered item ("Content Queue: One
 * queue item per movie/TV show").
 */
export class DiscoveryWorker {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly discoveryEngine: DiscoveryEngine,
    private readonly queues: ImportQueues,
    private readonly logger: ImportLogger,
  ) {}

  start(): Promise<void> {
    return this.queues.processDiscovery((job) => this.handle(job.id, job.payload));
  }

  private async handle(jobId: string, payload: DiscoveryJobPayload): Promise<void> {
    const startedAt = Date.now();
    const provider = this.registry.resolve(payload.providerId);
    const result = await this.discoveryEngine.run(provider, payload.mode);
    const durationMs = Date.now() - startedAt;

    if (!isOk(result)) {
      this.logger.logStage({
        jobId,
        providerId: payload.providerId,
        stage: 'discovery',
        durationMs,
        status: 'failure',
        error: result.error.message,
      });
      return;
    }

    for (const item of result.value.items) {
      const importPayload: ImportContentJobPayload = {
        providerId: payload.providerId,
        providerContentId: item.providerContentId,
        category: item.kind,
        priority: ImportPriorityEnum.HIGH,
        attempt: 1,
      };
      await this.queues.enqueueImport(importPayload);
    }

    this.logger.logStage({
      jobId,
      providerId: payload.providerId,
      stage: 'discovery',
      durationMs,
      status: 'success',
    });
  }
}
