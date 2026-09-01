import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { DashboardStatisticsDto } from '../dto.js';

@Injectable()
export class DashboardStatsRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async getStatistics(): Promise<DashboardStatisticsDto> {
    const [movies, shows, episodes, users] = await Promise.all([
      this.prisma.movie.count({ where: { deletedAt: null } }),
      this.prisma.tVShow.count({ where: { deletedAt: null } }),
      this.prisma.episode.count(),
      this.prisma.user.count(),
    ]);
    return { movies, shows, episodes, users };
  }
}
