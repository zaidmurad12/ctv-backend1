export type DiscoverCategory =
  | 'newest'
  | 'popular'
  | 'trending'
  | 'latest_shows'
  | 'latest_episodes'
  | 'categories'
  | 'genres'
  | 'collections';

export interface DiscoverQuery {
  readonly category: DiscoverCategory;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SearchQuery {
  readonly term: string;
  readonly page?: number;
  readonly pageSize?: number;
}
