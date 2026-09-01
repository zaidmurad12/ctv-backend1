import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { SearchResultItemDto } from '../dto.js';

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
    const movieWhere = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      OR: [
        { title: { contains: term, mode: 'insensitive' as const } },
        { titleAr: { contains: term, mode: 'insensitive' as const } },
        { castMembers: { some: { person } } },
        { crewMembers: { some: { person } } },
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
      ],
    };

    const [movies, shows, movieTotal, showTotal] = await Promise.all([
      this.prisma.movie.findMany({
        where: movieWhere,
        include: { images: true },
        take: skip + take,
        orderBy: { popularity: 'desc' },
      }),
      this.prisma.tVShow.findMany({
        where: showWhere,
        include: { images: true },
        take: skip + take,
        orderBy: { popularity: 'desc' },
      }),
      this.prisma.movie.count({ where: movieWhere }),
      this.prisma.tVShow.count({ where: showWhere }),
    ]);

    const combined: SearchResultItemDto[] = [
      ...movies.map((movie) => ({
        id: movie.id,
        type: 'movie' as const,
        title: movie.title,
        poster: movie.images.find((image) => image.type === 'POSTER')?.url ?? null,
      })),
      ...shows.map((show) => ({
        id: show.id,
        type: 'show' as const,
        title: show.title,
        poster: show.images.find((image) => image.type === 'POSTER')?.url ?? null,
      })),
    ];

    return { items: combined.slice(skip, skip + take), total: movieTotal + showTotal };
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
