import { Module } from '@nestjs/common';
import { PrismaContentProviderLinkRepository } from '@ctv-platform/importer';
import { PrismaService } from '../prisma/prismaService.js';
import { ContentLinkReader } from './infrastructure/contentLinkReader.js';
import { createProviderCacheClient } from './infrastructure/providerCache.js';
import { ProviderRegistryRepository } from './infrastructure/providerRegistryRepository.js';
import { CONTENT_PROVIDER_LINK, PROVIDER_CACHE_CLIENT } from './ports.js';
import { ProviderMetricsTracker } from './providerMetricsTracker.js';
import { ProviderStreamResolver } from './providerStreamResolver.js';
import { ProvidersRuntime } from './providersRuntime.js';

/**
 * Everything generic about running provider plugins: the registry/lifecycle
 * runtime, registry-metadata persistence (enabled/priority/last sync),
 * content-link lookups, response caching, and live stream/subtitle
 * resolution. Consumet-specific code lives entirely in
 * `@ctv-platform/provider-consumet`; this module never mentions it by name
 * except where `ProvidersRuntime` registers whichever factories are enabled.
 * Imported by both `AdminModule` (provider management endpoints) and
 * `CatalogModule` (live stream/subtitle fallback) — neither of those two
 * modules import each other, avoiding any circular module dependency.
 */
@Module({
  providers: [
    ProvidersRuntime,
    ProviderRegistryRepository,
    ProviderMetricsTracker,
    ContentLinkReader,
    ProviderStreamResolver,
    {
      provide: CONTENT_PROVIDER_LINK,
      useFactory: (prisma: PrismaService) => new PrismaContentProviderLinkRepository(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: PROVIDER_CACHE_CLIENT,
      useFactory: createProviderCacheClient,
    },
  ],
  exports: [
    ProvidersRuntime,
    ProviderRegistryRepository,
    ProviderMetricsTracker,
    ProviderStreamResolver,
  ],
})
export class ProvidersModule {}
