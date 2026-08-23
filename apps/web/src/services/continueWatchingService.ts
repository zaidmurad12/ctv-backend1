import { apiRequest } from '../lib/apiClient';
import type { ContinueWatchingResponseDto } from '../lib/types';

export const continueWatchingService = {
  list(): Promise<ContinueWatchingResponseDto[]> {
    return apiRequest<ContinueWatchingResponseDto[]>('continue');
  },
  upsert(payload: {
    movieId?: string;
    episodeId?: string;
    position: number;
  }): Promise<{ id: string }> {
    return apiRequest<{ id: string }>('continue', { method: 'POST', body: payload });
  },
};
