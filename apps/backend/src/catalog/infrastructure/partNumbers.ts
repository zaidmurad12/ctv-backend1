import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';

/**
 * partNumber isn't a stored column - nothing on Movie tracks a franchise's own viewing order - so
 * it's derived fresh here from each collection's *complete* PUBLISHED membership, sorted by
 * releaseDate, every time. Re-querying full collection membership per call (rather than ranking
 * only whatever subset of items happened to already be in hand) is deliberate: a paginated list
 * (or a search result page) might only contain part 3 of a franchise without part 1 anywhere in
 * that same page, and ranking against just what's visible would call part 3 "part 1" - wrong, and
 * inconsistent with whatever number that exact movie gets shown as everywhere else in the app.
 * Collections are small in practice (a handful of entries), so the extra query per distinct
 * collectionId in a response is cheap. Shared by MovieQueryRepository and SearchQueryRepository
 * rather than each keeping its own copy of this.
 */
export async function attachPartNumbers<T extends { id: string; collectionId?: string | null }>(
  prisma: PrismaDatabaseClient,
  items: T[],
): Promise<T[]> {
  const collectionIds = [
    ...new Set(items.map((i) => i.collectionId).filter((id): id is string => !!id)),
  ];
  if (collectionIds.length === 0) return items;

  const siblings = await prisma.movie.findMany({
    where: { collectionId: { in: collectionIds }, deletedAt: null, status: 'PUBLISHED' },
    select: { id: true, collectionId: true, releaseDate: true },
  });
  const byCollection = new Map<string, { id: string; releaseDate: Date | null }[]>();
  for (const s of siblings) {
    if (!s.collectionId) continue;
    const arr = byCollection.get(s.collectionId) ?? [];
    arr.push(s);
    byCollection.set(s.collectionId, arr);
  }
  const partNumberById = new Map<string, number>();
  for (const arr of byCollection.values()) {
    arr.sort((a, b) => (a.releaseDate?.getTime() ?? 0) - (b.releaseDate?.getTime() ?? 0));
    arr.forEach((m, i) => partNumberById.set(m.id, i + 1));
  }
  return items.map((item) => ({ ...item, partNumber: partNumberById.get(item.id) ?? null }));
}
