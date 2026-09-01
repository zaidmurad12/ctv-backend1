import { err, isOk, ok } from '@ctv-platform/domain';
import type {
  DiscoverCategory,
  ProviderCatalogItemDto,
  ProviderInterface,
} from '@ctv-platform/sdk';
import { ProviderCapabilityEnum } from '@ctv-platform/sdk';
import { DiscoveryModeEnum, ImportFailureCategoryEnum } from '../enums.js';
import { ImportError, type ImportResult } from '../errors.js';
import type { DiscoveryCheckpointStore } from './discoveryCheckpointStore.js';

const STAGE = 'discovery';

/** specification/06-Cinemana-Reverse-Engineering.md.txt "Catalog Discovery: Newest, Latest TV Shows, Latest Episodes". */
const INCREMENTAL_CATEGORIES: readonly DiscoverCategory[] = [
  'newest',
  'latest_shows',
  'latest_episodes',
];

/** Every category the provider can discover, for a Full Discovery run. */
const FULL_CATEGORIES: readonly DiscoverCategory[] = [
  'newest',
  'popular',
  'trending',
  'latest_shows',
  'latest_episodes',
  'categories',
  'genres',
  'collections',
];

/** Safety bound so a misbehaving provider can never make Full Discovery loop forever. */
const MAX_PAGES_PER_CATEGORY = 50;

export interface DiscoveryRunResult {
  readonly items: readonly ProviderCatalogItemDto[];
  readonly discoveredAt: Date;
}

/**
 * Discovers catalog items from a single provider, per
 * specification/05-Provider-Architecture.md.txt's discovery capability.
 * Incremental/Scheduled discovery only scans the "what's new" categories
 * (one page each); Full/Manual discovery paginates every category. Manual
 * discovery is simply this same engine invoked on demand (see
 * `scheduler/importScheduler.ts`), rather than a separate code path.
 */
export class DiscoveryEngine {
  constructor(private readonly checkpoints: DiscoveryCheckpointStore) {}

  async run(
    provider: ProviderInterface,
    mode: DiscoveryModeEnum,
  ): Promise<ImportResult<DiscoveryRunResult>> {
    if (!provider.supports(ProviderCapabilityEnum.DISCOVERY)) {
      return err(
        new ImportError(
          ImportFailureCategoryEnum.PROVIDER_ERROR,
          STAGE,
          `Provider "${provider.metadata.id}" does not support discovery.`,
        ),
      );
    }

    const isFullScan = mode === DiscoveryModeEnum.FULL || mode === DiscoveryModeEnum.MANUAL;
    const categories = isFullScan ? FULL_CATEGORIES : INCREMENTAL_CATEGORIES;
    const items: ProviderCatalogItemDto[] = [];
    const seen = new Set<string>();

    for (const category of categories) {
      const pageLimit = isFullScan ? MAX_PAGES_PER_CATEGORY : 1;
      for (let page = 1; page <= pageLimit; page += 1) {
        const result = await provider.discover({ category, page });
        if (!isOk(result)) {
          return err(
            new ImportError(ImportFailureCategoryEnum.PROVIDER_ERROR, STAGE, result.error.message, {
              cause: result.error,
            }),
          );
        }

        for (const item of result.value.items) {
          if (!seen.has(item.providerContentId)) {
            seen.add(item.providerContentId);
            items.push(item);
          }
        }

        if (result.value.items.length === 0 || items.length >= result.value.totalCount) {
          break;
        }
      }
    }

    const discoveredAt = new Date();
    await this.checkpoints.setLastDiscoveredAt(provider.metadata.id, discoveredAt);
    return ok({ items, discoveredAt });
  }
}
