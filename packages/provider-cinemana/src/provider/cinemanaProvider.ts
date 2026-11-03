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
import { CinemanaHttpError } from '../client/cinemanaHttpClient.js';
import type { CinemanaContentService } from '../services/cinemanaContentService.js';

const PROVIDER_ID = 'cinemana';

export const CINEMANA_CAPABILITIES = [
  ProviderCapabilityEnum.SEARCH,
  ProviderCapabilityEnum.MOVIE_DETAILS,
  ProviderCapabilityEnum.SHOW_DETAILS,
  ProviderCapabilityEnum.SEASON_DETAILS,
  ProviderCapabilityEnum.EPISODE_DETAILS,
  ProviderCapabilityEnum.STREAMS,
  ProviderCapabilityEnum.SUBTITLES,
  // No DISCOVERY: unlike Consumet's source routes, nothing in this
  // undocumented API was ever found that lists "newest"/"trending" without a
  // search term - see this package's README. Claiming the capability and
  // always returning an empty list would look like "no results" instead of
  // the true "not supported", so it's left out entirely; a discovery call
  // correctly fails with NOT_SUPPORTED instead.
  // No METADATA_ENRICHMENT: same reasoning as Consumet - this must never be
  // able to overwrite TMDB-sourced descriptive metadata.
] as const;

export function buildCinemanaMetadata(priority: number): ProviderMetadata {
  return {
    id: PROVIDER_ID,
    name: 'Cinemana',
    version: '1.0.0',
    apiVersion: '1',
    minimumSupportedVersion: '1',
    priority,
    capabilities: CINEMANA_CAPABILITIES,
  };
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof CinemanaHttpError) {
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
    error instanceof Error ? error.message : 'Unknown Cinemana provider error.',
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
 * Concrete `ProviderInterface` implementation backed by the undocumented
 * `cinemana.shabakaty.com` Android API (see this package's README for what
 * that is and the legal caveats around using it). All transport/mapping
 * logic lives in `CinemanaContentService`/`cinemanaMapper`; this class only
 * translates that into the `doXxx` primitives `AbstractProvider` expects,
 * per `specification/05-Provider-Architecture.md.txt`.
 */
export class CinemanaProvider extends AbstractProvider {
  constructor(
    metadata: ProviderMetadata,
    config: ProviderConfig,
    logger: ProviderLogger,
    private readonly content: CinemanaContentService,
    dependencies: AbstractProviderDependencies = {},
  ) {
    super(metadata, config, logger, dependencies);
  }

  protected async doHealth(): Promise<ProviderResult<ProviderHealth>> {
    const startedAt = Date.now();
    return guard(async () => {
      await this.content.search('a', 1);
      return {
        status: ProviderStatusEnum.HEALTHY,
        latencyMs: Date.now() - startedAt,
        version: this.metadata.version,
        checkedAt: new Date(),
      };
    });
  }

  protected doDiscover(_query: DiscoverQuery): Promise<ProviderResult<ProviderSearchResultDto>> {
    return Promise.resolve(
      err(
        new ProviderError(
          ProviderErrorCodeEnum.NOT_SUPPORTED,
          PROVIDER_ID,
          'Cinemana has no listing endpoint - only title search is supported.',
        ),
      ),
    );
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
        throw new CinemanaHttpError('http', `Season ${seasonNumber} not found.`, 404);
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
        throw new CinemanaHttpError(
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
