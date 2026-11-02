// Shared by the admin movies/shows lists. "rating" is the one an admin uses to find old,
// high-rated titles worth manually drafting; nulls sort last so unrated titles never crowd the top.
export type AdminListOrderBy = Array<Record<string, 'asc' | 'desc'>>;

export function adminListOrderBy(sort?: string): AdminListOrderBy {
  switch (sort) {
    case 'rating':
      return [{ rating: 'desc' }, { voteCount: 'desc' }];
    case 'rating-asc':
      return [{ rating: 'asc' }, { voteCount: 'desc' }];
    case 'oldest':
      return [{ releaseDate: 'asc' }];
    case 'popularity':
      return [{ popularity: 'desc' }];
    default:
      // The app's own order (catalog queryHelpers: newest release first, id as the tiebreak) - it used
      // to be releaseDate alone, which put undated titles first (Postgres sorts NULLs first in desc)
      // and shuffled same-date titles between loads, so the list never matched the app.
      return [{ releaseDate: 'desc' }, { id: 'asc' }];
  }
}

// The default ("newest") admin order, matching the app: the app's newest lists only ever show
// titles already released (catalog queryHelpers: releaseDate <= now), newest first. Sorting every
// title by release date alone put upcoming ones - future dates - above all of them, stuck at the
// top of the admin list for as long as their date stayed ahead. Released titles come first here,
// in the app's own order; upcoming and undated ones after them, soonest first.
type ListModel<T> = {
  count(args: { where: unknown }): Promise<number>;
  findMany(args: { where: unknown; include: unknown; skip: number; take: number; orderBy: unknown }): Promise<T[]>;
};
export async function releasedFirstPage<T>(
  model: ListModel<T>,
  where: Record<string, unknown>,
  include: unknown,
  page: number,
  limit: number,
): Promise<T[]> {
  const now = new Date();
  const released = { AND: [where, { releaseDate: { lte: now } }] };
  const upcoming = { AND: [where, { OR: [{ releaseDate: { gt: now } }, { releaseDate: null }] }] };
  const releasedCount = await model.count({ where: released });
  const skip = (page - 1) * limit;
  const items: T[] = [];
  if (skip < releasedCount) {
    items.push(
      ...(await model.findMany({ where: released, include, skip, take: limit, orderBy: [{ releaseDate: 'desc' }, { id: 'asc' }] })),
    );
  }
  const remaining = limit - items.length;
  if (remaining > 0) {
    items.push(
      ...(await model.findMany({
        where: upcoming,
        include,
        skip: Math.max(0, skip - releasedCount),
        take: remaining,
        orderBy: [{ releaseDate: 'asc' }, { id: 'asc' }],
      })),
    );
  }
  return items;
}

export function isDefaultNewestSort(sort?: string): boolean {
  return !sort || sort === 'newest';
}
