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

// "Newest" (release date, newest first) with the admin's "move to newest" button: a moved title
// counts as released at the moment it was moved, so it shows first and steps back as newer titles
// come out. Only the first PROMOTED_MERGE_DEPTH rows are merged this way; deeper pages are read
// as they are (a moved title may then show twice across that boundary - the app drops repeats).
export const PROMOTED_MERGE_DEPTH = 300;

export function mergePromoted<
  T extends { id: string; releaseDate: Date | null; promotedAt?: Date | null },
>(plain: T[], promoted: T[]): T[] {
  const at = (row: T) => Math.max(row.releaseDate?.getTime() ?? 0, row.promotedAt?.getTime() ?? 0);
  const byId = new Map<string, T>();
  for (const row of [...plain, ...promoted]) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => at(b) - at(a) || (a.id < b.id ? -1 : 1));
}
