import { apiRequest } from '../lib/apiClient';
import type { EpisodeSummaryDto } from '../lib/types';

export const seasonsService = {
  episodes(seasonId: string): Promise<EpisodeSummaryDto[]> {
    return apiRequest<EpisodeSummaryDto[]>(`seasons/${seasonId}/episodes`);
  },
};
