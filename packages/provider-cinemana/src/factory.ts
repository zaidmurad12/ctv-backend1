import { createProviderConfig, type ProviderFactory } from '@ctv-platform/sdk';
import { CinemanaHttpClient } from './client/cinemanaHttpClient.js';
import type { CinemanaEnvConfig } from './config.js';
import { CinemanaConsoleLogger } from './logger.js';
import { buildCinemanaMetadata, CinemanaProvider } from './provider/cinemanaProvider.js';
import { CinemanaContentService } from './services/cinemanaContentService.js';

/**
 * Providers are never instantiated directly at call sites (per
 * `specification/05-Provider-Architecture.md.txt`) - a host app registers
 * this factory with `ProviderRegistry.registerFactory()`, gated behind its
 * own `PROVIDER_CINEMANA_ENABLED` check, and the registry instantiates it
 * lazily on first resolution. Same shape as `ConsumetProviderFactory` -
 * enabling/disabling either provider at runtime (no restart needed) then
 * goes through the exact same generic admin "providers" endpoints.
 */
export class CinemanaProviderFactory implements ProviderFactory<CinemanaProvider> {
  readonly providerId = 'cinemana';

  constructor(private readonly env: CinemanaEnvConfig) {}

  create(): CinemanaProvider {
    const config = createProviderConfig({
      baseUrl: this.env.baseUrl,
      timeoutMs: this.env.timeoutMs,
      maxRequestsPerInterval: this.env.maxRequestsPerSecond,
      intervalMs: 1000,
    });
    const client = new CinemanaHttpClient({
      baseUrl: this.env.baseUrl,
      timeoutMs: this.env.timeoutMs,
      cacheTtlSeconds: this.env.cacheTtlSeconds,
      userAgent: config.userAgent,
    });
    const content = new CinemanaContentService(client);
    return new CinemanaProvider(
      buildCinemanaMetadata(this.env.priority),
      config,
      new CinemanaConsoleLogger('warn'),
      content,
    );
  }
}
