import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { FavoriteResponseDto } from '../dto.js';

@Injectable()
export class FavoriteRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async add(
    userId: string,
    movieId: string | undefined,
    showId: string | undefined,
  ): Promise<string> {
    const row = await this.prisma.favorite.create({
      data: { id: randomUUID(), userId, movieId, showId },
    });
    return row.id;
  }

  async remove(userId: string, id: string): Promise<number> {
    const result = await this.prisma.favorite.deleteMany({ where: { id, userId } });
    return result.count;
  }

  async list(userId: string): Promise<FavoriteResponseDto[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      include: {
        movie: { include: { images: true } },
        show: { include: { images: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => {
      const content = row.movie ?? row.show;
      return {
        id: row.id,
        movieId: row.movieId,
        showId: row.showId,
        title: content?.title ?? '',
        poster: content?.images.find((image) => image.type === 'POSTER')?.url ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
