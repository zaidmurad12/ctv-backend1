import { apiRequest } from '../lib/apiClient';
import type {
  EpisodeSummaryDto,
  SeasonSummaryDto,
  ShowDetailDto,
  ShowSummaryDto,
} from '../lib/types';

export const showsService = {
  latest(): Promise<ShowSummaryDto[]> {
    return apiRequest<ShowSummaryDto[]>('shows/latest');
  },
  trending(): Promise<ShowSummaryDto[]> {
    return apiRequest<ShowSummaryDto[]>('shows/trending');
  },
  popular(): Promise<ShowSummaryDto[]> {
    return apiRequest<ShowSummaryDto[]>('shows/popular');
  },
  topRated(): Promise<ShowSummaryDto[]> {
    return apiRequest<ShowSummaryDto[]>('shows/top-rated');
  },
  getById(id: string): Promise<ShowDetailDto> {
    return apiRequest<ShowDetailDto>(`shows/${id}`);
  },
  seasons(id: string): Promise<SeasonSummaryDto[]> {
    return apiRequest<SeasonSummaryDto[]>(`shows/${id}/seasons`);
  },
  episodes(id: string): Promise<EpisodeSummaryDto[]> {
    return apiRequest<EpisodeSummaryDto[]>(`shows/${id}/episodes`);
  },
};
