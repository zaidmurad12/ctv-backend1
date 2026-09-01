import type {
  ProviderCatalogItemDto,
  ProviderEpisodeDto,
  ProviderMovieDto,
  ProviderSearchResultDto,
  ProviderSeasonDto,
  ProviderShowDto,
  ProviderStreamDto,
  ProviderSubtitleDto,
} from '@ctv-platform/sdk';
import type { CinemanaHttpClient } from '../client/cinemanaHttpClient.js';
import {
  mapEpisodeFromShow,
  mapMovieInfo,
  mapSearchResults,
  mapSeasonFromShow,
  mapShowInfo,
  mapStreams,
  mapSubtitles,
} from '../mapper/cinemanaMapper.js';
import type {
  CinemanaAllInfoResponse,
  CinemanaSearchResponse,
  CinemanaSeasonResponse,
  CinemanaStreamsResponse,
} from '../types/cinemanaApi.js';

/**
 * Orchestrates the HTTP client + pure mapper per operation - same split of
 * responsibility as `provider-consumet`'s `ConsumetContentService`: no
 * business logic, no Prisma, no caching decisions beyond what the client
 * already does for raw responses.
 */
export class CinemanaContentService {
  constructor(private readonly client: CinemanaHttpClient) {}

  /**
   * `AdvancedSearch` requires an explicit `type` (`movie`/`series`) and only
   * ever searches within it - a caller here doesn't know in advance which
   * kind the title it's looking for is (`ProviderStreamResolver` searches by
   * a bare title string for both movies and shows), so this fires both and
   * merges the results, same as how a single Consumet "source" already mixes
   * kinds in one result list.
   */
  async search(term: string, page = 1): Promise<ProviderSearchResultDto> {
    const [movies, series] = await Promise.all([
      this.client.get<CinemanaSearchResponse>('/AdvancedSearch', { videoTitle: term, type: 'movie', page }),
      this.client.get<CinemanaSearchResponse>('/AdvancedSearch', { videoTitle: term, type: 'series', page }),
    ]);
    const items: readonly ProviderCatalogItemDto[] = [
      ...mapSearchResults(movies),
      ...mapSearchResults(series),
    ];
    return { items, totalCount: items.length };
  }

  async info(id: string): Promise<CinemanaAllInfoResponse> {
    return this.client.getById<CinemanaAllInfoResponse>('allVideoInfo', id);
  }

  async movie(providerMovieId: string): Promise<ProviderMovieDto> {
    const raw = await this.info(providerMovieId);
    return mapMovieInfo(raw);
  }

  async show(providerShowId: string): Promise<ProviderShowDto> {
    const [anchor, episodes] = await Promise.all([
      this.info(providerShowId),
      this.client.getById<CinemanaSeasonResponse>('videoSeason', providerShowId),
    ]);
    return mapShowInfo(providerShowId, anchor, episodes);
  }

  async season(providerShowId: string, seasonNumber: number): Promise<ProviderSeasonDto | null> {
    const show = await this.show(providerShowId);
    return mapSeasonFromShow(show, seasonNumber);
  }

  async episode(
    providerShowId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<ProviderEpisodeDto | null> {
    const show = await this.show(providerShowId);
    return mapEpisodeFromShow(show, seasonNumber, episodeNumber);
  }

  async streams(providerContentId: string): Promise<readonly ProviderStreamDto[]> {
    const raw = await this.client.getById<CinemanaStreamsResponse>(
      'transcoddedFiles',
      providerContentId,
    );
    return mapStreams(raw);
  }

  async subtitles(providerContentId: string): Promise<readonly ProviderSubtitleDto[]> {
    const raw = await this.info(providerContentId);
    return mapSubtitles(raw);
  }
}
