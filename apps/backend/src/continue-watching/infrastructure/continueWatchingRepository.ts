import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { ContinueWatchingResponseDto } from '../dto.js';

@Injectable()
export class ContinueWatchingRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  /** No unique constraint exists for (userId, movieId|episodeId), so the upsert is manual. */
  async upsert(
    userId: string,
    movieId: string | undefined,
    episodeId: string | undefined,
    position: number,
  ): Promise<string> {
    const existing = await this.prisma.continueWatching.findFirst({
      where: { userId, movieId: movieId ?? null, episodeId: episodeId ?? null },
    });

    if (existing) {
      await this.prisma.continueWatching.update({ where: { id: existing.id }, data: { position } });
      return existing.id;
    }

    const created = await this.prisma.continueWatching.create({
      data: { id: randomUUID(), userId, movieId, episodeId, position },
    });
    return created.id;
  }

  async list(userId: string): Promise<ContinueWatchingResponseDto[]> {
    const rows = await this.prisma.continueWatching.findMany({
      where: { userId },
      include: { movie: true, episode: true },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      movieId: row.movieId,
      episodeId: row.episodeId,
      title: row.movie?.title ?? row.episode?.title ?? '',
      poster: row.movie?.poster ?? row.episode?.stillImage ?? null,
      position: row.position,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
