import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import { attachPartNumbers } from '../../catalog/infrastructure/partNumbers.js';
import type { SearchResultItemDto } from '../dto.js';

// Arabic spelling variants that a viewer using a remote-control keyboard shouldn't have to care about:
// every hamza-carrying alef (أ إ آ) is just ا, ى is ي, and ة is ه for matching purposes. Typing
// "افاتار" therefore finds "أفاتار". Applied to BOTH the typed term and the stored Arabic title.
const ARABIC_FROM = 'أإآىة';
const ARABIC_TO = 'ااايه';
function normalizeArabic(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const at = ARABIC_FROM.indexOf(ch);
      return at === -1 ? ch : ARABIC_TO[at]!;
    })
    .join('')
    .toLowerCase();
}
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (m) => `\\${m}`);

@Injectable()
export class SearchQueryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  /**
   * specification/09-Backend-API.md.txt "Search API: Movie Search, TV
   * Search, Arabic, English, Mixed" — a case-insensitive `contains` filter
   * works for both scripts since it does not rely on tokenization.
   *
   * Also matches a cast/crew member's name (director, writer, actor, ...) - a viewer typing an
   * actor's name expects to find that actor's movies/shows, not just titles containing the same
   * text. `some` on the join table is what turns "does this person's name match" into "does this
   * title have any credited person whose name matches".
   */
  async search(
    term: string,
    skip: number,
    take: number,
  ): Promise<{ items: SearchResultItemDto[]; total: number }> {
    const person = { name: { contains: term, mode: 'insensitive' as const } };
    const { movieIds, showIds } = await this.arabicNormalizedMatches(term);
    const movieWhere = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      OR: [
        { title: { contains: term, mode: 'insensitive' as const } },
        { titleAr: { contains: term, mode: 'insensitive' as const } },
        { castMembers: { some: { person } } },
        { crewMembers: { some: { person } } },
        ...(movieIds.length ? [{ id: { in: movieIds } }] : []),
      ],
    };
    const showWhere = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      OR: [
        { title: { contains: term, mode: 'insensitive' as const } },
        { titleAr: { contains: term, mode: 'insensitive' as const } },
        { castMembers: { some: { person } } },
        { crewMembers: { some: { person } } },
        ...(showIds.length ? [{ id: { in: showIds } }] : []),
      ],
    };

    // A wider pool than the page, ranked below: title matches first, then cast/crew matches, films
    // and series merged by popularity. Films used to fill the whole page before any series, and an
    // actor-name match could push a title that *is* named like the query off the page entirely.
    const pool = Math.max(skip + take, 120);
    const [movies, shows, movieTotal, showTotal] = await Promise.all([
      this.prisma.movie.findMany({
        where: movieWhere,
        include: {
          images: true,
          providers: { select: { streams: { where: { isActive: true }, select: { id: true }, take: 1 } } },
        },
        take: pool,
        orderBy: { popularity: 'desc' },
      }),
      this.prisma.tVShow.findMany({
        where: showWhere,
        include: { images: true },
        take: pool,
        orderBy: { popularity: 'desc' },
      }),
      this.prisma.movie.count({ where: movieWhere }),
      this.prisma.tVShow.count({ where: showWhere }),
    ]);

    // collectionId carried only long enough for attachPartNumbers to rank against - stripped
    // back out below since SearchResultItemDto never exposes it (shows don't even have one).
    const moviesWithPartNumbers = await attachPartNumbers(
      this.prisma,
      movies.map((movie) => ({
        id: movie.id,
        type: 'movie' as const,
        title: movie.title,
        titleAr: movie.titleAr,
        poster: movie.images.find((image) => image.type === 'POSTER')?.url ?? null,
        rating: movie.rating === null ? null : Number(movie.rating),
        releaseDate: movie.releaseDate?.toISOString() ?? null,
        collectionId: movie.collectionId,
        hasSourceMatch: movie.hasSourceMatch === true || movie.providers.some((p) => p.streams.length > 0) ? true : movie.hasSourceMatch,
      })),
    );
    const popularity = new Map<string, number>([
      ...movies.map((m) => [m.id, Number(m.popularity ?? 0)] as const),
      ...shows.map((sh) => [sh.id, Number(sh.popularity ?? 0)] as const),
    ]);

    const combined: SearchResultItemDto[] = [
      ...moviesWithPartNumbers.map(({ collectionId: _collectionId, ...item }) => item),
      ...shows.map((show) => ({
        id: show.id,
        type: 'show' as const,
        title: show.title,
        titleAr: show.titleAr,
        poster: show.images.find((image) => image.type === 'POSTER')?.url ?? null,
        rating: show.rating === null ? null : Number(show.rating),
        releaseDate: show.releaseDate?.toISOString() ?? null,
        hasSourceMatch: show.hasSourceMatch,
      })),
    ];

    const needle = normalizeArabic(term.trim());
    const rank = (item: SearchResultItemDto): number => {
      const titles = [item.title, item.titleAr ?? ''].map(normalizeArabic);
      if (titles.some((t) => t === needle)) return 0;
      if (titles.some((t) => t.startsWith(needle))) return 1;
      if (titles.some((t) => t.includes(needle))) return 2;
      return 3;
    };
    combined.sort((a, b) => rank(a) - rank(b) || (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0));

    return { items: combined.slice(skip, skip + take), total: movieTotal + showTotal };
  }

  // Ids of titles whose Arabic title matches once both sides are spelling-normalized (see
  // normalizeArabic). Only runs for a term that actually contains Arabic letters.
  private async arabicNormalizedMatches(term: string): Promise<{ movieIds: string[]; showIds: string[] }> {
    if (!/[؀-ۿ]/.test(term)) return { movieIds: [], showIds: [] };
    const like = `%${escapeLike(normalizeArabic(term))}%`;
    const [movies, shows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Movie" WHERE "deletedAt" IS NULL AND status = 'PUBLISHED' AND translate(coalesce("titleAr", ''), ${ARABIC_FROM}, ${ARABIC_TO}) ILIKE ${like} LIMIT 300`,
      this.prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "TVShow" WHERE "deletedAt" IS NULL AND status = 'PUBLISHED' AND translate(coalesce("titleAr", ''), ${ARABIC_FROM}, ${ARABIC_TO}) ILIKE ${like} LIMIT 300`,
    ]);
    return { movieIds: movies.map((m) => m.id), showIds: shows.map((s) => s.id) };
  }

  async suggest(term: string, limit: number): Promise<string[]> {
    const where = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      OR: [
        { title: { contains: term, mode: 'insensitive' as const } },
        { titleAr: { contains: term, mode: 'insensitive' as const } },
      ],
    };
    const [movies, shows] = await Promise.all([
      this.prisma.movie.findMany({ where, select: { title: true }, take: limit }),
      this.prisma.tVShow.findMany({ where, select: { title: true }, take: limit }),
    ]);
    return [...new Set([...movies.map((m) => m.title), ...shows.map((s) => s.title)])].slice(
      0,
      limit,
    );
  }
}
