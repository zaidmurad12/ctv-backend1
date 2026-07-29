import { isOk } from '@ctv-platform/domain';
import { ProviderStatusEnum } from '../enums.js';
import type { ProviderLogger } from '../logger.js';
import type { ProviderInterface } from '../provider/providerInterface.js';
import type { ProviderRegistry } from './providerRegistry.js';

export interface ProviderLifecycleSnapshot {
  readonly providerId: string;
  readonly status: ProviderStatusEnum;
  readonly lastCheckedAt: Date;
  readonly latencyMs: number;
  readonly message?: string;
}

/**
 * Drives the lifecycle described in
 * `specification/05-Provider-Architecture.md.txt`: Registered -> Health Check
 * -> Available. Authentication is the provider's own concern (triggered
 * internally by its `health()`/retry logic), so this manager only observes
 * the resulting status.
 */
export class ProviderLifecycleManager {
  private readonly snapshots = new Map<string, ProviderLifecycleSnapshot>();

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly logger: ProviderLogger,
  ) {}

  async initialize(): Promise<readonly ProviderLifecycleSnapshot[]> {
    return Promise.all(this.registry.list().map((provider) => this.checkOne(provider)));
  }

  async refresh(providerId: string): Promise<ProviderLifecycleSnapshot> {
    return this.checkOne(this.registry.resolve(providerId));
  }

  getSnapshot(providerId: string): ProviderLifecycleSnapshot | null {
    return this.snapshots.get(providerId) ?? null;
  }

  listSnapshots(): readonly ProviderLifecycleSnapshot[] {
    return [...this.snapshots.values()];
  }

  private async checkOne(provider: ProviderInterface): Promise<ProviderLifecycleSnapshot> {
    const result = await provider.health();
    const snapshot: ProviderLifecycleSnapshot = isOk(result)
      ? {
          providerId: provider.metadata.id,
          status: result.value.status,
          lastCheckedAt: result.value.checkedAt,
          latencyMs: result.value.latencyMs,
          message: result.value.message,
        }
      : {
          providerId: provider.metadata.id,
          status: ProviderStatusEnum.UNAVAILABLE,
          lastCheckedAt: new Date(),
          latencyMs: 0,
          message: result.error.message,
        };

    this.snapshots.set(provider.metadata.id, snapshot);
    this.logger.info('Provider health checked', {
      provider: provider.metadata.id,
      status: snapshot.status,
    });
    return snapshot;
  }
}
