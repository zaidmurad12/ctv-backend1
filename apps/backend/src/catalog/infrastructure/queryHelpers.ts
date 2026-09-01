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
): Record<string, SortOrder> {
  const resolved = SORT_FIELD[sort ?? 'newest'] ?? SORT_FIELD.newest;
  return { [resolved.field]: order ?? resolved.defaultOrder };
}

export function resolveSkip(page: number | undefined, limit: number | undefined): number {
  return ((page ?? 1) - 1) * (limit ?? 20);
}
