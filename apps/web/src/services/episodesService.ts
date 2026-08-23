import { apiRequest } from '../lib/apiClient';
import type { EpisodeDetailDto } from '../lib/types';

export const episodesService = {
  getById(id: string): Promise<EpisodeDetailDto> {
    return apiRequest<EpisodeDetailDto>(`episodes/${id}`);
  },
};
