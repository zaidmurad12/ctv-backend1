import { apiRequest, apiRequestWithMeta } from './apiClient';
import type { ListParams, Page, SearchResultItemDto } from './types';

export const searchService = {
  async search(query: string, params: ListParams = {}): Promise<Page<SearchResultItemDto>> {
    const { data, meta } = await apiRequestWithMeta<SearchResultItemDto[]>('search', {
      params: { ...params, search: query },
    });
    return { items: data, meta: meta! };
  },

  suggestions(query: string): Promise<string[]> {
    return apiRequest<string[]>('search/suggestions', { params: { search: query } });
  },
};
