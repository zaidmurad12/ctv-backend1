import type { PrismaDatabaseClient } from './client.js';

export interface TransactionalUnitOfWork {
  <T>(operation: (prisma: PrismaDatabaseClient) => Promise<T>): Promise<T>;
}

export class PrismaUnitOfWork {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async run<T>(operation: (prisma: PrismaDatabaseClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx: PrismaDatabaseClient) => operation(tx));
  }
}

export class PrismaQueryHelper {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async countModel(model: 'movie' | 'tvShow' | 'season' | 'episode'): Promise<number> {
    switch (model) {
      case 'movie':
        return this.prisma.movie.count();
      case 'tvShow':
        return this.prisma.tVShow.count();
      case 'season':
        return this.prisma.season.count();
      case 'episode':
        return this.prisma.episode.count();
    }
  }
}
