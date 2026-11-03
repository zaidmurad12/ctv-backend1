import { Injectable } from '@nestjs/common';
import { ConsoleLogger } from '@ctv-platform/infrastructure';
import { DiscoveryEngine, InMemoryDiscoveryCheckpointStore } from '@ctv-platform/importer';
import { ProviderLifecycleManager, ProviderRegistry } from '@ctv-platform/sdk';
import { ConsumetProviderFactory, readConsumetEnv } from '@ctv-platform/provider-consumet';
import { CinemanaProviderFactory, readCinemanaEnv } from '@ctv-platform/provider-cinemana';

/**
 * The shared, process-lifetime `ProviderRegistry` for this app. Concrete
 * providers register themselves here behind their own enable/disable env
 * flag — this is the literal mechanism behind "enable/disable without code
 * changes": when `PROVIDER_CONSUMET_ENABLED` is false (or unset), the
 * factory is never registered, so `registry.list()`/`tryResolve('consumet')`
 * behave exactly as if the package weren't installed at all, with no
 * runtime errors and no missing-dependency failures.
 */
@Injectable()
export class ProvidersRuntime {
  readonly registry = new ProviderRegistry();
  readonly discoveryEngine = new DiscoveryEngine(new InMemoryDiscoveryCheckpointStore());
  readonly lifecycleManager = new ProviderLifecycleManager(
    this.registry,
    new ConsoleLogger('warn'),
  );

  constructor() {
    const consumetEnv = readConsumetEnv();
    if (consumetEnv.enabled) {
      this.registry.registerFactory(new ConsumetProviderFactory(consumetEnv));
    }

    const cinemanaEnv = readCinemanaEnv();
    if (cinemanaEnv.enabled) {
      this.registry.registerFactory(new CinemanaProviderFactory(cinemanaEnv));
    }
  }
}
