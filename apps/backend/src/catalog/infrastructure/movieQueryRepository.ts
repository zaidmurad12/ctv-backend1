import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type {
  MovieDetailDto,
  MovieSummaryDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from '../dto.js';
import { mapImagesToArtwork } from './artworkMapper.js';
import { mapCast, mapCountry, mapDirector, mapGenres, mapWriter } from './creditsMapper.js';
import { resolveOrderBy, resolveSkip } from './queryHelpers.js';

export interface MovieListParams {
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
  readonly search?: string;
  readonly year?: number;
  readonly language?: string;
  readonly minVotes?: number;
}

@Injectable()
export class MovieQueryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async list(params: MovieListParams): Promise<{ items: MovieSummaryDto[]; total: number }> {
    const skip = resolveSkip(params.page, params.limit);
    const take = params.limit ?? 20;
    const where = this.buildWhere(params);

    const [rows, total] = await Promise.all([
      this.prisma.movie.findMany({
        where,
        include: {
          images: true,
          genres: { include: { genre: true } },
          providers: { include: { streams: true } },
        },
        skip,
        take,
        orderBy: resolveOrderBy(params.sort, params.order),
      }),
      this.prisma.movie.count({ where }),
    ]);

    return { items: rows.map((row) => this.toSummary(row)), total };
  }

  async findById(id: string): Promise<MovieDetailDto | null> {
    const row = await this.prisma.movie.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: true,
        genres: { include: { genre: true } },
        castMembers: { include: { person: true }, orderBy: { order: 'asc' }, take: 8 },
        crewMembers: { include: { person: true } },
        countries: { include: { country: true } },
        providers: { include: { streams: true } },
      },
    });
    if (!row) {
      return null;
    }

    const [streams, subtitles] = await Promise.all([this.listStreams(id), this.listSubtitles(id)]);
    return {
      ...this.toSummary(row),
      originalTitle: row.originalTitle,
      tagline: row.tagline,
      genres: mapGenres(row.genres),
      cast: mapCast(row.castMembers),
      director: mapDirector(row.crewMembers),
      writer: mapWriter(row.crewMembers),
      country: mapCountry(row.countries),
      streams,
      subtitles,
    };
  }

  async listStreams(movieId: string): Promise<StreamResponseDto[]> {
    const rows = await this.prisma.stream.findMany({
      where: { isActive: true, movieProvider: { movieId } },
      orderBy: { isDefault: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      quality: row.quality,
      codec: row.codec,
      language: row.language,
      serverName: row.serverName ?? '',
      streamUrl: row.streamUrl,
      isDefault: row.isDefault,
    }));
  }

  async listSubtitles(movieId: string): Promise<SubtitleResponseDto[]> {
    const rows = await this.prisma.subtitle.findMany({ where: { movieProvider: { movieId } } });
    return rows.map((row) => ({
      id: row.id,
      language: row.language,
      format: row.format,
      url: row.url,
      isDefault: row.isDefault,
      defaultOffsetMs: row.defaultOffsetMs,
      defaultSpeed: row.defaultSpeed,
    }));
  }

  /**
   * Genre-overlap recommendations: ranks unseen PUBLISHED movies by how many
   * genres they share with the user's favorited/watched movies. Falls back
   * to popularity for users with no history yet (nothing to derive genres from).
   */
  async recommended(userId: string, limit: number): Promise<MovieSummaryDto[]> {
    const [favorites, history] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
      }),
      this.prisma.watchHistory.findMany({
        where: { userId, movieId: { not: null } },
        select: { movieId: true },
      }),
    ]);
    const seenMovieIds = [
      ...new Set(
        [...favorites, ...history]
          .map((row) => row.movieId)
          .filter((id): id is string => id !== null),
      ),
    ];

    if (seenMovieIds.length === 0) {
      const { items } = await this.list({ sort: 'popularity', limit, page: 1 });
      return items;
    }

    const seenGenres = await this.prisma.movieGenre.findMany({
      where: { movieId: { in: seenMovieIds } },
      select: { genreId: true },
    });
    const genreIds = [...new Set(seenGenres.map((row) => row.genreId))];

    if (genreIds.length === 0) {
      const { items } = await this.list({ sort: 'popularity', limit, page: 1 });
      return items;
    }

    const candidates = await this.prisma.movie.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        id: { notIn: seenMovieIds },
        genres: { some: { genreId: { in: genreIds } } },
      },
      include: {
        images: true,
        genres: { include: { genre: true } },
        providers: { include: { streams: true } },
      },
      take: Math.max(limit * 5, 100),
      orderBy: { popularity: 'desc' },
    });

    const genreIdSet = new Set(genreIds);
    const scored = candidates.map((row) => ({
      row,
      score: row.genres.filter((g) => genreIdSet.has(g.genreId)).length,
    }));
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return Number(b.row.popularity ?? 0) - Number(a.row.popularity ?? 0);
    });

    return scored.slice(0, limit).map(({ row }) => this.toSummary(row));
  }

  private buildWhere(params: MovieListParams): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null, status: 'PUBLISHED' };
    if (params.search) {
      // Only ever matched the English `title` column - searching "الجوكر" for "Joker" (or any
      // other Arabic-titled search) always came back empty even though the movie was in the
      // catalog, since titleAr was never checked at all.
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { titleAr: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.year) {
      where.releaseDate = {
        gte: new Date(Date.UTC(params.year, 0, 1)),
        lt: new Date(Date.UTC(params.year + 1, 0, 1)),
      };
    }
    if (params.language) {
      where.originalLanguage = params.language;
    }
    if (params.minVotes) {
      where.voteCount = { gte: params.minVotes };
    }
    return where;
  }

  private toSummary(row: {
    id: string;
    title: string;
    titleAr: string | null;
    overview: string | null;
    overviewAr: string | null;
    releaseDate: Date | null;
    rating: unknown;
    runtime: number | null;
    ageRating: string | null;
    originalLanguage: string | null;
    status: string;
    images: Array<{ type: string; url: string }>;
    genres: Parameters<typeof mapGenres>[0];
    collectionId?: string | null;
    providers: Array<{ streams: Array<{ isActive: boolean }> }>;
  }): MovieSummaryDto {
    return {
      id: row.id,
      title: row.title,
      titleAr: row.titleAr,
      overview: row.overview,
      overviewAr: row.overviewAr,
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      rating: row.rating === null ? null : Number(row.rating),
      runtime: row.runtime,
      ageRating: row.ageRating,
      originalLanguage: row.originalLanguage,
      status: row.status,
      genres: mapGenres(row.genres),
      hasPlayableStream: row.providers.some((p) => p.streams.some((s) => s.isActive)),
      collectionId: row.collectionId ?? null,
      artwork: mapImagesToArtwork(row.images),
    };
  }

  /**
   * Movies curated for the home hero carousel (see Movie.featuredOrder), in admin-chosen order.
   * featuredOrder is carried on each result (not part of MovieSummaryDto itself) purely so
   * MoviesUseCases.featured() can merge this with ShowQueryRepository's own featured() by that
   * shared order value - the carousel can mix movies and shows into one single, interleaved
   * sequence, which needs the raw number, not just "already sorted within this one table".
   */
  async featured(): Promise<Array<MovieSummaryDto & { featuredOrder: number }>> {
    const rows = await this.prisma.movie.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', featuredOrder: { not: null } },
      include: {
        images: true,
        genres: { include: { genre: true } },
        providers: { include: { streams: true } },
      },
      orderBy: { featuredOrder: 'asc' },
    });
    return rows.map((row) => ({
      ...this.toSummary(row),
      featuredOrder: row.featuredOrder as number,
    }));
  }

  /** Sibling entries in the same TMDB collection/franchise (see Movie.collectionId), for the "Parts" rail on a movie's detail page. */
  async byCollection(collectionId: string, excludeId?: string): Promise<MovieSummaryDto[]> {
    const rows = await this.prisma.movie.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        collectionId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: {
        images: true,
        genres: { include: { genre: true } },
        providers: { include: { streams: true } },
      },
      orderBy: { releaseDate: 'asc' },
    });
    return rows.map((row) => this.toSummary(row));
  }
}
