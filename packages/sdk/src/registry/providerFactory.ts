import type { ProviderInterface } from '../provider/providerInterface.js';

/**
 * Providers are never instantiated manually at call sites. A factory is
 * registered instead; the registry calls `create()` lazily on first
 * resolution and caches the resulting singleton.
 */
export interface ProviderFactory<TProvider extends ProviderInterface = ProviderInterface> {
  readonly providerId: string;
  create(): TProvider;
}
