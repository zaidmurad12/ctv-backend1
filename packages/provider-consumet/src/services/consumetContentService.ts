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
import type { ConsumetHttpClient } from '../client/consumetHttpClient.js';
import {
  decodeContentId,
  mapEpisodeFromShow,
  mapMovieInfo,
  mapSeasonFromShow,
  mapShowInfo,
  mapStreamSources,
  mapSubtitles,
  mapSearchResult,
} from '../mapper/consumetMapper.js';
import type {
  ConsumetMediaInfoResponse,
  ConsumetSearchResponse,
  ConsumetWatchResponse,
} from '../types/consumetApi.js';

/**
 * Orchestrates the HTTP client + pure mapper per operation. This is the
 * "Send Requests / Parse Responses / Map External Objects" responsibility
 * `specification/05-Provider-Architecture.md.txt` assigns to providers — no
 * business logic, no Prisma, no caching decisions beyond what the client
 * already does for raw responses.
 */
export class ConsumetContentService {
  constructor(
    private readonly client: ConsumetHttpClient,
    private readonly source: string,
  ) {}

  async search(term: string, page = 1): Promise<ProviderSearchResultDto> {
    const raw = await this.client.get<ConsumetSearchResponse>(
      `movies/${this.source}/${encodeURIComponent(term)}`,
      { page },
    );
    return mapSearchResult(raw);
  }

  async discover(category: string, page = 1): Promise<readonly ProviderCatalogItemDto[]> {
    const raw = await this.client.get<ConsumetSearchResponse>(`movies/${this.source}/${category}`, {
      page,
    });
    return mapSearchResult(raw).items;
  }

  async mediaInfo(mediaId: string): Promise<ConsumetMediaInfoResponse> {
    return this.client.get<ConsumetMediaInfoResponse>(`movies/${this.source}/info`, {
      id: mediaId,
    });
  }

  async movie(providerMovieId: string): Promise<ProviderMovieDto> {
    const { mediaId } = decodeContentId(providerMovieId);
    const raw = await this.mediaInfo(mediaId);
    return mapMovieInfo(raw);
  }

  async show(providerShowId: string): Promise<ProviderShowDto> {
    const raw = await this.mediaInfo(providerShowId);
    return mapShowInfo(raw);
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

  private async watch(providerContentId: string): Promise<ConsumetWatchResponse> {
    const { mediaId, playableId } = decodeContentId(providerContentId);
    return this.client.get<ConsumetWatchResponse>(`movies/${this.source}/watch`, {
      episodeId: playableId,
      mediaId,
    });
  }

  async streams(providerContentId: string): Promise<readonly ProviderStreamDto[]> {
    const raw = await this.watch(providerContentId);
    return mapStreamSources(raw);
  }

  async subtitles(providerContentId: string): Promise<readonly ProviderSubtitleDto[]> {
    const raw = await this.watch(providerContentId);
    return mapSubtitles(raw);
  }
}
