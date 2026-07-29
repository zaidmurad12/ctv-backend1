import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type {
  EpisodeDetailDto,
  EpisodeSummaryDto,
  SeasonDetailDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from '../dto.js';

@Injectable()
export class SeasonQueryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async findById(id: string): Promise<SeasonDetailDto | null> {
    const row = await this.prisma.season.findUnique({ where: { id } });
    if (!row) {
      return null;
    }
    const episodes = await this.listEpisodes(id);
    return {
      id: row.id,
      seasonNumber: row.seasonNumber,
      name: row.name,
      overview: row.overview,
      episodeCount: row.episodeCount,
      poster: row.poster,
      episodes,
    };
  }

  async listEpisodes(seasonId: string): Promise<EpisodeSummaryDto[]> {
    const rows = await this.prisma.episode.findMany({
      where: { seasonId },
      orderBy: { episodeNumber: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      episodeNumber: row.episodeNumber,
      title: row.title,
      overview: row.overview,
      runtime: row.runtime,
      stillImage: row.stillImage,
    }));
  }
}

@Injectable()
export class EpisodeQueryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async findById(id: string): Promise<EpisodeDetailDto | null> {
    const row = await this.prisma.episode.findUnique({ where: { id } });
    if (!row) {
      return null;
    }
    const [streams, subtitles] = await Promise.all([this.listStreams(id), this.listSubtitles(id)]);
    return {
      id: row.id,
      episodeNumber: row.episodeNumber,
      title: row.title,
      overview: row.overview,
      runtime: row.runtime,
      stillImage: row.stillImage,
      streams,
      subtitles,
    };
  }

  async listStreams(episodeId: string): Promise<StreamResponseDto[]> {
    const rows = await this.prisma.stream.findMany({
      where: { isActive: true, episodeProvider: { episodeId } },
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

  async listSubtitles(episodeId: string): Promise<SubtitleResponseDto[]> {
    const rows = await this.prisma.subtitle.findMany({ where: { episodeProvider: { episodeId } } });
    return rows.map((row) => ({
      id: row.id,
      language: row.language,
      format: row.format,
      url: row.url,
      isDefault: row.isDefault,
    }));
  }
}
