import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { SeasonSummaryDto, ShowDetailDto, ShowSummaryDto } from '../dto.js';
import { mapImagesToArtwork } from './artworkMapper.js';
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
    const where = this.buildWhere(params);

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
    };
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
    numberOfSeasons: number;
    numberOfEpisodes: number;
    ageRating: string | null;
    originalLanguage: string | null;
    status: string;
    images: Array<{ type: string; url: string }>;
    genres: Parameters<typeof mapGenres>[0];
  }): ShowSummaryDto {
    return {
      id: row.id,
      title: row.title,
      titleAr: row.titleAr,
      overview: row.overview,
      overviewAr: row.overviewAr,
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      rating: row.rating === null ? null : Number(row.rating),
      numberOfSeasons: row.numberOfSeasons,
      numberOfEpisodes: row.numberOfEpisodes,
      ageRating: row.ageRating,
      originalLanguage: row.originalLanguage,
      status: row.status,
      genres: mapGenres(row.genres),
      artwork: mapImagesToArtwork(row.images),
    };
  }
}
