import { isOk } from '@ctv-platform/domain';
import type { ProviderRegistry } from '@ctv-platform/sdk';
import type { ImportContentJobPayload } from '../jobs/importJobs.js';
import type {
  DeadLetterQueue,
  ImportLogger,
  ImportMetrics,
  JobRetryPolicy,
} from '../operations/index.js';
import type { ImportOrchestrator } from '../orchestrator/importOrchestrator.js';
import type { ImportQueues } from '../queues/importQueues.js';

/**
 * Consumes the Import Queue: runs the full per-item pipeline, records
 * metrics, and either requeues with backoff or moves the job to the dead
 * letter queue, per the job-level retry table.
 */
export class ImportWorker {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly orchestrator: ImportOrchestrator,
    private readonly queues: ImportQueues,
    private readonly retryPolicy: JobRetryPolicy,
    private readonly deadLetterQueue: DeadLetterQueue<ImportContentJobPayload>,
    private readonly metrics: ImportMetrics,
    private readonly logger: ImportLogger,
    private readonly delay: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  start(): Promise<void> {
    return this.queues.processImport((job) => this.handle(job.id, job.payload));
  }

  private async handle(jobId: string, payload: ImportContentJobPayload): Promise<void> {
    const startedAt = Date.now();
    const provider = this.registry.resolve(payload.providerId);
    const result = await this.orchestrator.importOne(
      provider,
      payload.providerContentId,
      payload.category,
    );
    const durationMs = Date.now() - startedAt;
    this.metrics.recordImportDuration(durationMs);

    if (isOk(result)) {
      if (payload.category === 'movie') {
        this.metrics.recordMovieImported();
      } else {
        this.metrics.recordShowImported();
      }
      this.logger.logStage({
        jobId,
        providerId: payload.providerId,
        contentId: result.value.contentId,
        stage: `${payload.category}-import`,
        durationMs,
        status: 'success',
      });
      return;
    }

    this.metrics.recordFailure();
    this.logger.logStage({
      jobId,
      providerId: payload.providerId,
      stage: result.error.stage,
      durationMs,
      status: 'failure',
      error: result.error.message,
    });

    const decision = this.retryPolicy.decide(result.error.category, payload.attempt);
    if (decision.shouldRetry) {
      this.metrics.recordRetry();
      await this.delay(decision.delayMs);
      await this.queues.enqueueImport({ ...payload, attempt: payload.attempt + 1 });
      return;
    }

    this.deadLetterQueue.add(jobId, payload, result.error.message, payload.attempt);
  }
}
