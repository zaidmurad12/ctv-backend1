import { ProviderCapabilityEnum } from '@ctv-platform/sdk';
import type { ProviderRegistry } from '@ctv-platform/sdk';
import { DiscoveryModeEnum } from '../enums.js';
import type { ImportQueues } from '../queues/importQueues.js';

export interface ImportSchedulerClock {
  readonly setInterval: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  readonly clearInterval: (handle: ReturnType<typeof setInterval>) => void;
}

const REAL_CLOCK: ImportSchedulerClock = { setInterval, clearInterval };

/**
 * Drives Scheduled Discovery ("Daily Sync") plus the explicit Manual/
 * Incremental/Full discovery entry points from
 * specification/08-Import-Pipeline.md.txt "Import Modes". Manual discovery
 * is not a separate code path — it is this same discovery pipeline invoked
 * on demand instead of on a timer.
 */
export class ImportScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly queues: ImportQueues,
    private readonly intervalMs: number,
    private readonly clock: ImportSchedulerClock = REAL_CLOCK,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = this.clock.setInterval(() => {
      void this.runScheduledDiscovery();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      this.clock.clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runScheduledDiscovery(): Promise<void> {
    for (const provider of this.registry.listByCapability(ProviderCapabilityEnum.DISCOVERY)) {
      await this.queues.enqueueDiscovery({
        providerId: provider.metadata.id,
        mode: DiscoveryModeEnum.SCHEDULED,
      });
    }
  }

  triggerManualDiscovery(providerId: string): Promise<void> {
    return this.queues.enqueueDiscovery({ providerId, mode: DiscoveryModeEnum.MANUAL });
  }

  triggerIncrementalDiscovery(providerId: string): Promise<void> {
    return this.queues.enqueueDiscovery({ providerId, mode: DiscoveryModeEnum.INCREMENTAL });
  }

  triggerFullDiscovery(providerId: string): Promise<void> {
    return this.queues.enqueueDiscovery({ providerId, mode: DiscoveryModeEnum.FULL });
  }
}
