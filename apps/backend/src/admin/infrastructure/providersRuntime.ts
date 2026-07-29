import { Injectable } from '@nestjs/common';
import { ConsoleLogger } from '@ctv-platform/infrastructure';
import { DiscoveryEngine, InMemoryDiscoveryCheckpointStore } from '@ctv-platform/importer';
import { ProviderLifecycleManager, ProviderRegistry } from '@ctv-platform/sdk';

/**
 * The shared, process-lifetime `ProviderRegistry` for this app. It starts
 * empty because no concrete provider (e.g. Cinemana) has been built —
 * building one would mean reverse-engineering a third-party site without
 * authorization, which was explicitly declined. Registering a real provider
 * here is the only change a future authorized integration would need.
 */
@Injectable()
export class ProvidersRuntime {
  readonly registry = new ProviderRegistry();
  readonly discoveryEngine = new DiscoveryEngine(new InMemoryDiscoveryCheckpointStore());
  readonly lifecycleManager = new ProviderLifecycleManager(
    this.registry,
    new ConsoleLogger('warn'),
  );
}
