import type { SortOrder } from '../../common/dto/pagination.dto.js';

/** specification/09-Backend-API.md.txt "Sorting". */
const SORT_FIELD: Record<string, { field: string; defaultOrder: SortOrder }> = {
  newest: { field: 'createdAt', defaultOrder: 'desc' },
  oldest: { field: 'createdAt', defaultOrder: 'asc' },
  popularity: { field: 'popularity', defaultOrder: 'desc' },
  rating: { field: 'rating', defaultOrder: 'desc' },
  releaseDate: { field: 'releaseDate', defaultOrder: 'desc' },
  alphabetical: { field: 'title', defaultOrder: 'asc' },
  runtime: { field: 'runtime', defaultOrder: 'desc' },
};

export function resolveOrderBy(
  sort: string | undefined,
  order: SortOrder | undefined,
): Record<string, SortOrder>[] {
  const resolved = SORT_FIELD[sort ?? 'newest'] ?? SORT_FIELD.newest;
  // `id` as a final tiebreaker: every sort field above has ties (same release date, rating 0 on
  // every upcoming title, same popularity), and Postgres returns tied rows in no stable order, so
  // OFFSET paging showed the same title on two pages while skipping others - reported in the app
  // as "lots of duplicated titles" while the table itself held no duplicate rows at all.
  return [{ [resolved.field]: order ?? resolved.defaultOrder }, { id: 'asc' }];
}

export function resolveSkip(page: number | undefined, limit: number | undefined): number {
  return ((page ?? 1) - 1) * (limit ?? 20);
}
