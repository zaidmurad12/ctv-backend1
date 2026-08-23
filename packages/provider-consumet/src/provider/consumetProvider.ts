import { err, ok } from '@ctv-platform/domain';
import type {
  AbstractProviderDependencies,
  DiscoverQuery,
  ProviderConfig,
  ProviderEpisodeDto,
  ProviderHealth,
  ProviderLogger,
  ProviderMetadata,
  ProviderMovieDto,
  ProviderResult,
  ProviderSearchResultDto,
  ProviderSeasonDto,
  ProviderShowDto,
  ProviderStreamDto,
  ProviderSubtitleDto,
  SearchQuery,
} from '@ctv-platform/sdk';
import {
  AbstractProvider,
  ProviderCapabilityEnum,
  ProviderError,
  ProviderErrorCodeEnum,
  ProviderStatusEnum,
} from '@ctv-platform/sdk';
import { ConsumetHttpError } from '../client/consumetHttpClient.js';
import type { ConsumetContentService } from '../services/consumetContentService.js';

const PROVIDER_ID = 'consumet';

/** Maps our generic discovery categories onto the handful of listing routes most Consumet movie sources expose. */
const DISCOVER_ROUTE_BY_CATEGORY: Partial<Record<DiscoverQuery['category'], string>> = {
  newest: 'recent-movies',
  latest_shows: 'recent-shows',
  trending: 'trending',
  popular: 'popular',
};

export const CONSUMET_CAPABILITIES = [
  ProviderCapabilityEnum.DISCOVERY,
  ProviderCapabilityEnum.SEARCH,
  ProviderCapabilityEnum.MOVIE_DETAILS,
  ProviderCapabilityEnum.SHOW_DETAILS,
  ProviderCapabilityEnum.SEASON_DETAILS,
  ProviderCapabilityEnum.EPISODE_DETAILS,
  ProviderCapabilityEnum.STREAMS,
  ProviderCapabilityEnum.SUBTITLES,
  // Deliberately no METADATA_ENRICHMENT: Consumet must never be able to
  // overwrite TMDB-sourced descriptive metadata (title/overview/artwork).
  // See services/importer/src/metadata/metadataMerger.ts.
] as const;

export function buildConsumetMetadata(priority: number): ProviderMetadata {
  return {
    id: PROVIDER_ID,
    name: 'Consumet',
    version: '1.0.0',
    apiVersion: '1',
    minimumSupportedVersion: '1',
    priority,
    capabilities: CONSUMET_CAPABILITIES,
  };
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ConsumetHttpError) {
    if (error.kind === 'timeout') {
      return new ProviderError(ProviderErrorCodeEnum.TIMEOUT, PROVIDER_ID, error.message, {
        cause: error,
      });
    }
    if (error.status === 401) {
      return new ProviderError(ProviderErrorCodeEnum.UNAUTHORIZED, PROVIDER_ID, error.message, {
        cause: error,
      });
    }
    if (error.status === 403) {
      return new ProviderError(ProviderErrorCodeEnum.FORBIDDEN, PROVIDER_ID, error.message, {
        cause: error,
      });
    }
    if (error.status === 404) {
      return new ProviderError(ProviderErrorCodeEnum.NOT_FOUND, PROVIDER_ID, error.message, {
        cause: error,
      });
    }
    if (error.status === 429) {
      return new ProviderError(ProviderErrorCodeEnum.RATE_LIMITED, PROVIDER_ID, error.message, {
        cause: error,
      });
    }
    if (error.kind === 'network' || (error.status !== null && error.status >= 500)) {
      return new ProviderError(ProviderErrorCodeEnum.UNKNOWN_ERROR, PROVIDER_ID, error.message, {
        cause: error,
      });
    }
    return new ProviderError(ProviderErrorCodeEnum.INVALID_RESPONSE, PROVIDER_ID, error.message, {
      cause: error,
    });
  }
  return new ProviderError(
    ProviderErrorCodeEnum.UNKNOWN_ERROR,
    PROVIDER_ID,
    error instanceof Error ? error.message : 'Unknown Consumet provider error.',
    { cause: error },
  );
}

async function guard<T>(operation: () => Promise<T>): Promise<ProviderResult<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    return err(toProviderError(error));
  }
}

/**
 * Concrete `ProviderInterface` implementation backed by a self-hosted
 * Consumet REST API instance. All transport/mapping logic lives in
 * `ConsumetContentService`/`consumetMapper`; this class only translates that
 * into the `doXxx` primitives `AbstractProvider` expects, per
 * `specification/05-Provider-Architecture.md.txt`.
 */
export class ConsumetProvider extends AbstractProvider {
  constructor(
    metadata: ProviderMetadata,
    config: ProviderConfig,
    logger: ProviderLogger,
    private readonly content: ConsumetContentService,
    dependencies: AbstractProviderDependencies = {},
  ) {
    super(metadata, config, logger, dependencies);
  }

  protected async doHealth(): Promise<ProviderResult<ProviderHealth>> {
    const startedAt = Date.now();
    return guard(async () => {
      await this.content.discover('recent-movies', 1);
      return {
        status: ProviderStatusEnum.HEALTHY,
        latencyMs: Date.now() - startedAt,
        version: this.metadata.version,
        checkedAt: new Date(),
      };
    });
  }

  protected doDiscover(query: DiscoverQuery): Promise<ProviderResult<ProviderSearchResultDto>> {
    const route = DISCOVER_ROUTE_BY_CATEGORY[query.category];
    if (!route) {
      return Promise.resolve(ok({ items: [], totalCount: 0 }));
    }
    return guard(async () => {
      const items = await this.content.discover(route, query.page ?? 1);
      return { items, totalCount: items.length };
    });
  }

  protected doSearch(query: SearchQuery): Promise<ProviderResult<ProviderSearchResultDto>> {
    return guard(() => this.content.search(query.term, query.page ?? 1));
  }

  protected doMovie(providerMovieId: string): Promise<ProviderResult<ProviderMovieDto>> {
    return guard(() => this.content.movie(providerMovieId));
  }

  protected doShow(providerShowId: string): Promise<ProviderResult<ProviderShowDto>> {
    return guard(() => this.content.show(providerShowId));
  }

  protected doSeason(
    providerShowId: string,
    seasonNumber: number,
  ): Promise<ProviderResult<ProviderSeasonDto>> {
    return guard(async () => {
      const season = await this.content.season(providerShowId, seasonNumber);
      if (!season) {
        throw new ConsumetHttpError('http', `Season ${seasonNumber} not found.`, 404);
      }
      return season;
    });
  }

  protected doEpisode(
    providerShowId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<ProviderResult<ProviderEpisodeDto>> {
    return guard(async () => {
      const episode = await this.content.episode(providerShowId, seasonNumber, episodeNumber);
      if (!episode) {
        throw new ConsumetHttpError(
          'http',
          `Episode S${seasonNumber}E${episodeNumber} not found.`,
          404,
        );
      }
      return episode;
    });
  }

  protected doStreams(
    providerContentId: string,
  ): Promise<ProviderResult<readonly ProviderStreamDto[]>> {
    return guard(() => this.content.streams(providerContentId));
  }

  protected doSubtitles(
    providerContentId: string,
  ): Promise<ProviderResult<readonly ProviderSubtitleDto[]>> {
    return guard(() => this.content.subtitles(providerContentId));
  }
}
