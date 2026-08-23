import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { SeasonSummaryDto, ShowDetailDto, ShowSummaryDto } from '../dto.js';
import { mapImagesToArtwork } from './artworkMapper.js';
import { mapCast, mapDirector, mapGenres } from './creditsMapper.js';
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
        include: { images: true },
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
      },
    });
    if (!row) {
      return null;
    }

    const seasons = await this.listSeasons(id);
    return {
      ...this.toSummary(row),
      originalTitle: row.originalTitle,
      titleAr: row.titleAr,
      genres: mapGenres(row.genres),
      cast: mapCast(row.castMembers),
      director: mapDirector(row.crewMembers),
      seasons,
    };
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
    }));
  }

  private buildWhere(params: MovieListParams): Record<string, unknown> {
    const where: Record<string, unknown> = { deletedAt: null, status: 'PUBLISHED' };
    if (params.search) {
      where.title = { contains: params.search, mode: 'insensitive' };
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
    overview: string | null;
    releaseDate: Date | null;
    rating: unknown;
    numberOfSeasons: number;
    numberOfEpisodes: number;
    status: string;
    images: Array<{ type: string; url: string }>;
  }): ShowSummaryDto {
    return {
      id: row.id,
      title: row.title,
      overview: row.overview,
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      rating: row.rating === null ? null : Number(row.rating),
      numberOfSeasons: row.numberOfSeasons,
      numberOfEpisodes: row.numberOfEpisodes,
      status: row.status,
      artwork: mapImagesToArtwork(row.images),
    };
  }
}
