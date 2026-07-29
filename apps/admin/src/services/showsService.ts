import { apiRequest, apiRequestWithMeta } from './apiClient';
import type {
  CatalogListParams,
  EpisodeSummaryDto,
  Page,
  SeasonSummaryDto,
  ShowDetailDto,
  ShowSummaryDto,
} from './types';

export const showsService = {
  async list(params: CatalogListParams): Promise<Page<ShowSummaryDto>> {
    const { data, meta } = await apiRequestWithMeta<ShowSummaryDto[]>('shows', { params });
    return { items: data, meta: meta! };
  },

  getById(id: string): Promise<ShowDetailDto> {
    return apiRequest<ShowDetailDto>(`shows/${id}`);
  },

  listSeasons(id: string): Promise<SeasonSummaryDto[]> {
    return apiRequest<SeasonSummaryDto[]>(`shows/${id}/seasons`);
  },

  listEpisodes(id: string): Promise<EpisodeSummaryDto[]> {
    return apiRequest<EpisodeSummaryDto[]>(`shows/${id}/episodes`);
  },
};
