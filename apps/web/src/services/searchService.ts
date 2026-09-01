import { apiRequest } from '../lib/apiClient';
import type { SearchResultItemDto } from '../lib/types';

export const searchService = {
  search(query: string): Promise<SearchResultItemDto[]> {
    return apiRequest<SearchResultItemDto[]>('search', { params: { search: query } });
  },
};
