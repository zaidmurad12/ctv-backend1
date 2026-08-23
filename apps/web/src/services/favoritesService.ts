import { apiRequest } from '../lib/apiClient';
import type { FavoriteResponseDto } from '../lib/types';

export const favoritesService = {
  list(): Promise<FavoriteResponseDto[]> {
    return apiRequest<FavoriteResponseDto[]>('favorites');
  },
  add(payload: { movieId?: string; showId?: string }): Promise<{ id: string }> {
    return apiRequest<{ id: string }>('favorites', { method: 'POST', body: payload });
  },
  remove(id: string): Promise<void> {
    return apiRequest<void>(`favorites/${id}`, { method: 'DELETE' });
  },
};
