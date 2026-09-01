import { apiRequest } from '../lib/apiClient';
import type { HistoryResponseDto } from '../lib/types';

export const historyService = {
  list(): Promise<HistoryResponseDto[]> {
    return apiRequest<HistoryResponseDto[]>('history');
  },
  record(payload: {
    movieId?: string;
    episodeId?: string;
    position: number;
    duration: number;
  }): Promise<{ id: string }> {
    return apiRequest<{ id: string }>('history', { method: 'POST', body: payload });
  },
};
