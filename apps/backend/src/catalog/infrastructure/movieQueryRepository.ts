import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type {
  MovieDetailDto,
  MovieSummaryDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from '../dto.js';
import { mapImagesToArtwork, withStoredLogo } from './artworkMapper.js';
import { mapCast, mapCountry, mapDirector, mapGenres, mapWriter } from './creditsMapper.js';
import { attachPartNumbers } from './partNumbers.js';
import { parseSourceLinks } from '../../common/sourceLinks.js';
import { resolveOrderBy, resolveSkip } from './queryHelpers.js';

export interface MovieListParams {
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
  readonly search?: string;
  readonly year?: number;
  readonly language?: string;
  readonly genre?: string;
  readonly minVotes?: number;
  readonly minRating?: number;
  readonly available?: boolean;
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
    // Sorted by release date = "newest releases": only what's actually out. A title with a future
    // release date (imported ahead of time) used to sit at the very top of every "newest" list
    // until that date came - reported as unreleased films stuck at the front of the latest row
    // while newer, already-released ones sat below them. Each one now appears on its own
    // release day, so the list keeps moving on its own.
    const baseWhere = this.buildWhere(params);
    const where: Record<string, unknown> =
      params.sort === 'releaseDate' ? { AND: [baseWhere, { releaseDate: { lte: new Date() } }] } : baseWhere;

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

    return { items: await attachPartNumbers(this.prisma, rows.map((row) => this.toSummary(row))), total };
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
    const [summaryWithPartNumber] = await attachPartNumbers(this.prisma, [this.toSummary(row)]);
    return {
      ...summaryWithPartNumber,
      originalTitle: row.originalTitle,
      tagline: row.tagline,
      genres: mapGenres(row.genres),
      cast: mapCast(row.castMembers),
      director: mapDirector(row.crewMembers),
      writer: mapWriter(row.crewMembers),
      country: mapCountry(row.countries),
      streams,
      subtitles,
      // row.trailer (see prisma/schema.prisma's own Movie.trailer) is populated automatically at
      // import time (extractEnrichmentFields.ts) - this DTO simply never had a field to carry it
      // to any client until now, so every trailer TMDB ever found was silently discarded here
      // regardless of the import having worked correctly.
      trailerUrl: row.trailer,
      sourceLinks: parseSourceLinks(row.sourceLinks),
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

    return attachPartNumbers(this.prisma, scored.slice(0, limit).map(({ row }) => this.toSummary(row)));
  }

  private buildWhere(params: MovieListParams): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null, status: 'PUBLISHED' };
    // "Available titles only" (app setting): passed the admin panel's source-compatibility check,
    // or has an active stream of its own.
    if (params.available) {
      where.AND = [
        {
          OR: [
            { hasSourceMatch: true },
            { providers: { some: { streams: { some: { isActive: true } } } } },
          ],
        },
      ];
    }
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
    if (params.genre) {
      // genres is a many-to-many through MovieGenre - `some` matches a movie that has at least
      // one linked genre row whose own genre.name equals the requested value. mapGenres()
      // (creditsMapper.ts) exposes genre.name verbatim as each movie's own `genres` array
      // client-side, so this is an exact match against the same string the app already filters
      // by locally today - no slug/id translation needed on either side.
      where.genres = { some: { genre: { name: params.genre } } };
    }
    if (params.minVotes) {
      where.voteCount = { gte: params.minVotes };
    }
    if (params.minRating) {
      where.rating = { gte: params.minRating };
    }
    return where;
  }

  private toSummary(row: {
    id: string;
    title: string;
    titleAr: string | null;
    overview: string | null;
    overviewAr: string | null;
    imdbId: string | null;
    releaseDate: Date | null;
    rating: unknown;
    runtime: number | null;
    ageRating: string | null;
    originalLanguage: string | null;
    status: string;
    images: Array<{ type: string; url: string }>;
    logo?: string | null;
    hasSourceMatch?: boolean | null;
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
      imdbId: row.imdbId,
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      rating: row.rating === null ? null : Number(row.rating),
      runtime: row.runtime,
      ageRating: row.ageRating,
      originalLanguage: row.originalLanguage,
      hasSourceMatch: row.hasSourceMatch ?? null,
      status: row.status,
      genres: mapGenres(row.genres),
      hasPlayableStream: row.providers.some((p) => p.streams.some((s) => s.isActive)),
      collectionId: row.collectionId ?? null,
      artwork: withStoredLogo(mapImagesToArtwork(row.images), row.logo),
    };
  }

  /** Published movies by id, returned in the order of `ids` (a missing/unpublished one is skipped) - for admin-built home rows. */
  async byIds(ids: string[]): Promise<MovieSummaryDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.movie.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'PUBLISHED' },
      include: {
        images: true,
        genres: { include: { genre: true } },
        providers: { include: { streams: true } },
      },
    });
    const summaries = await attachPartNumbers(this.prisma, rows.map((row) => this.toSummary(row)));
    const byId = new Map(summaries.map((summary) => [summary.id, summary]));
    return ids.map((id) => byId.get(id)).filter((s): s is MovieSummaryDto => !!s);
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
    const summaries = await attachPartNumbers(this.prisma, rows.map((row) => this.toSummary(row)));
    return summaries.map((summary, i) => ({
      ...summary,
      featuredOrder: rows[i].featuredOrder as number,
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
    return attachPartNumbers(this.prisma, rows.map((row) => this.toSummary(row)));
  }
}
