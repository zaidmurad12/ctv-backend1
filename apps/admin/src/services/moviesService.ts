import { apiRequest, apiRequestWithMeta } from './apiClient';
import type {
  CatalogListParams,
  MovieDetailDto,
  MovieSummaryDto,
  Page,
  StreamResponseDto,
  SubtitleResponseDto,
} from './types';

export const moviesService = {
  async list(params: CatalogListParams): Promise<Page<MovieSummaryDto>> {
    const { data, meta } = await apiRequestWithMeta<MovieSummaryDto[]>('movies', { params });
    return { items: data, meta: meta! };
  },

  getById(id: string): Promise<MovieDetailDto> {
    return apiRequest<MovieDetailDto>(`movies/${id}`);
  },

  listStreams(id: string): Promise<StreamResponseDto[]> {
    return apiRequest<StreamResponseDto[]>(`movies/${id}/streams`);
  },

  listSubtitles(id: string): Promise<SubtitleResponseDto[]> {
    return apiRequest<SubtitleResponseDto[]>(`movies/${id}/subtitles`);
  },
};
