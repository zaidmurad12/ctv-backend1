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
import { resolveOrderBy, resolveSkip } from './queryHelpers.js';

export interface MovieListParams {
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
  readonly search?: string;
  readonly year?: number;
  readonly language?: string;
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
        include: { images: true },
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
      include: { images: true },
    });
    if (!row) {
      return null;
    }

    const [streams, subtitles] = await Promise.all([this.listStreams(id), this.listSubtitles(id)]);
    return {
      ...this.toSummary(row),
      originalTitle: row.originalTitle,
      tagline: row.tagline,
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
    if (params.language) {
      where.originalLanguage = params.language;
    }
    return where;
  }

  private toSummary(row: {
    id: string;
    title: string;
    overview: string | null;
    releaseDate: Date | null;
    rating: unknown;
    runtime: number | null;
    status: string;
    images: Array<{ type: string; url: string }>;
  }): MovieSummaryDto {
    return {
      id: row.id,
      title: row.title,
      overview: row.overview,
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      rating: row.rating === null ? null : Number(row.rating),
      runtime: row.runtime,
      status: row.status,
      artwork: mapImagesToArtwork(row.images),
    };
  }
}
