import { parseSourceLinks } from '../../common/sourceLinks.js';
import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { SeasonSummaryDto, ShowDetailDto, ShowSummaryDto } from '../dto.js';
import { mapImagesToArtwork, withStoredLogo } from './artworkMapper.js';
import {
  mapCast,
  mapCountry,
  mapCreator,
  mapDirector,
  mapGenres,
  mapWriter,
} from './creditsMapper.js';
import { resolveOrderBy, resolveSkip } from './queryHelpers.js';
import type { MovieListParams } from './movieQueryRepository.js';

@Injectable()
export class ShowQueryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async list(params: MovieListParams): Promise<{ items: ShowSummaryDto[]; total: number }> {
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
      this.prisma.tVShow.findMany({
        where,
        include: { images: true, genres: { include: { genre: true } } },
        skip,
        take,
        orderBy: resolveOrderBy(params.sort, params.order),
      }),
      this.prisma.tVShow.count({ where }),
    ]);

    return { items: rows.map((row) => this.toSummary(row)), total };
  }

  async findById(id: string): Promise<ShowDetailDto | null> {
    const row = await this.prisma.tVShow.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: true,
        genres: { include: { genre: true } },
        castMembers: { include: { person: true }, orderBy: { order: 'asc' }, take: 8 },
        crewMembers: { include: { person: true } },
        countries: { include: { country: true } },
      },
    });
    if (!row) {
      return null;
    }

    const seasons = await this.listSeasons(id);
    return {
      ...this.toSummary(row),
      originalTitle: row.originalTitle,
      genres: mapGenres(row.genres),
      cast: mapCast(row.castMembers),
      director: mapDirector(row.crewMembers),
      writer: mapWriter(row.crewMembers),
      creator: mapCreator(row.crewMembers),
      country: mapCountry(row.countries),
      seasons,
      sourceLinks: parseSourceLinks(row.sourceLinks),
    };
  }

  /** Published shows by id, in the order of `ids` (missing/unpublished skipped) - for admin-built home rows. */
  async byIds(ids: string[]): Promise<ShowSummaryDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.tVShow.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'PUBLISHED' },
      include: { images: true, genres: { include: { genre: true } } },
    });
    const byId = new Map(rows.map((row) => [row.id, this.toSummary(row)]));
    return ids.map((id) => byId.get(id)).filter((s): s is ShowSummaryDto => !!s);
  }

  /** Shows curated for the home hero carousel (see TVShow.featuredOrder) - see MovieQueryRepository.featured()'s own comment for why featuredOrder rides along on each result. */
  async featured(): Promise<Array<ShowSummaryDto & { featuredOrder: number }>> {
    const rows = await this.prisma.tVShow.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', featuredOrder: { not: null } },
      include: { images: true, genres: { include: { genre: true } } },
      orderBy: { featuredOrder: 'asc' },
    });
    return rows.map((row) => ({
      ...this.toSummary(row),
      featuredOrder: row.featuredOrder as number,
    }));
  }

  async listSeasons(showId: string): Promise<SeasonSummaryDto[]> {
    const rows = await this.prisma.season.findMany({
      where: { showId },
      orderBy: { seasonNumber: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      seasonNumber: row.seasonNumber,
      name: row.name,
      episodeCount: row.episodeCount,
      poster: row.poster,
      airDate: row.airDate ? row.airDate.toISOString() : null,
    }));
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
            { seasons: { some: { episodes: { some: { providers: { some: { streams: { some: { isActive: true } } } } } } } } },
          ],
        },
      ];
    }
    if (params.search) {
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
      // Same relation shape as MovieQueryRepository's own identical clause (TVShowGenre mirrors
      // MovieGenre exactly) - see its own comment for why this matches genre.name verbatim.
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
    numberOfSeasons: number;
    numberOfEpisodes: number;
    ageRating: string | null;
    originalLanguage: string | null;
    status: string;
    images: Array<{ type: string; url: string }>;
    logo?: string | null;
    hasSourceMatch?: boolean | null;
    genres: Parameters<typeof mapGenres>[0];
  }): ShowSummaryDto {
    return {
      id: row.id,
      title: row.title,
      titleAr: row.titleAr,
      overview: row.overview,
      overviewAr: row.overviewAr,
      imdbId: row.imdbId,
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      rating: row.rating === null ? null : Number(row.rating),
      numberOfSeasons: row.numberOfSeasons,
      numberOfEpisodes: row.numberOfEpisodes,
      ageRating: row.ageRating,
      originalLanguage: row.originalLanguage,
      hasSourceMatch: row.hasSourceMatch ?? null,
      status: row.status,
      genres: mapGenres(row.genres),
      artwork: withStoredLogo(mapImagesToArtwork(row.images), row.logo),
    };
  }
}
