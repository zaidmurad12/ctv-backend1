import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { HistoryResponseDto } from '../dto.js';

@Injectable()
export class WatchHistoryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async record(
    userId: string,
    movieId: string | undefined,
    episodeId: string | undefined,
    position: number,
    duration: number,
  ): Promise<string> {
    const row = await this.prisma.watchHistory.create({
      data: { id: randomUUID(), userId, movieId, episodeId, position, duration },
    });
    return row.id;
  }

  async list(userId: string, take: number): Promise<HistoryResponseDto[]> {
    const rows = await this.prisma.watchHistory.findMany({
      where: { userId },
      include: { movie: true, episode: true },
      orderBy: { lastWatched: 'desc' },
      take,
    });

    return rows.map((row) => ({
      id: row.id,
      movieId: row.movieId,
      episodeId: row.episodeId,
      title: row.movie?.title ?? row.episode?.title ?? '',
      poster: row.movie?.poster ?? row.episode?.stillImage ?? null,
      position: row.position,
      duration: row.duration,
      lastWatched: row.lastWatched.toISOString(),
    }));
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.watchHistory.deleteMany({ where: { userId } });
  }
}
