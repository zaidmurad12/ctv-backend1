import type { ProviderCapabilityEnum } from '../enums.js';
import type {
  ProviderEpisodeDto,
  ProviderMovieDto,
  ProviderSearchResultDto,
  ProviderSeasonDto,
  ProviderShowDto,
  ProviderStreamDto,
  ProviderSubtitleDto,
} from '../dto.js';
import type { ProviderHealth } from '../health.js';
import type { ProviderMetadata } from '../metadata.js';
import type { DiscoverQuery, SearchQuery } from '../queries.js';
import type { ProviderResult } from '../result.js';

/**
 * The contract every provider must implement, per
 * `specification/05-Provider-Architecture.md.txt`. Core only ever depends on
 * this interface, never on a concrete provider.
 */
export interface ProviderInterface {
  readonly metadata: ProviderMetadata;

  health(): Promise<ProviderResult<ProviderHealth>>;
  discover(query: DiscoverQuery): Promise<ProviderResult<ProviderSearchResultDto>>;
  search(query: SearchQuery): Promise<ProviderResult<ProviderSearchResultDto>>;
  movie(providerMovieId: string): Promise<ProviderResult<ProviderMovieDto>>;
  show(providerShowId: string): Promise<ProviderResult<ProviderShowDto>>;
  season(providerShowId: string, seasonNumber: number): Promise<ProviderResult<ProviderSeasonDto>>;
  episode(
    providerShowId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<ProviderResult<ProviderEpisodeDto>>;
  streams(providerContentId: string): Promise<ProviderResult<readonly ProviderStreamDto[]>>;
  subtitles(providerContentId: string): Promise<ProviderResult<readonly ProviderSubtitleDto[]>>;

  /** Whether this provider instance advertises the given capability. */
  supports(capability: ProviderCapabilityEnum): boolean;
}
