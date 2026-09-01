import { createProviderConfig, type ProviderFactory } from '@ctv-platform/sdk';
import { ConsumetHttpClient } from './client/consumetHttpClient.js';
import type { ConsumetEnvConfig } from './config.js';
import { ConsumetConsoleLogger } from './logger.js';
import { buildConsumetMetadata, ConsumetProvider } from './provider/consumetProvider.js';
import { ConsumetContentService } from './services/consumetContentService.js';

/**
 * Providers are never instantiated directly at call sites (per
 * `specification/05-Provider-Architecture.md.txt`) — a host app registers
 * this factory with `ProviderRegistry.registerFactory()`, gated behind its
 * own `PROVIDER_CONSUMET_ENABLED` check, and the registry instantiates it
 * lazily on first resolution.
 */
export class ConsumetProviderFactory implements ProviderFactory<ConsumetProvider> {
  readonly providerId = 'consumet';

  constructor(private readonly env: ConsumetEnvConfig) {}

  create(): ConsumetProvider {
    const config = createProviderConfig({
      baseUrl: this.env.baseUrl,
      timeoutMs: this.env.timeoutMs,
      maxRequestsPerInterval: this.env.maxRequestsPerSecond,
      intervalMs: 1000,
    });
    const client = new ConsumetHttpClient({
      baseUrl: this.env.baseUrl,
      timeoutMs: this.env.timeoutMs,
      cacheTtlSeconds: this.env.cacheTtlSeconds,
      userAgent: config.userAgent,
    });
    const content = new ConsumetContentService(client, this.env.source);
    return new ConsumetProvider(
      buildConsumetMetadata(this.env.priority),
      config,
      new ConsumetConsoleLogger('warn'),
      content,
    );
  }
}
