import type { TVShow, TVShowRepository } from '@ctv-platform/domain';
import type { PrismaDatabaseClient } from '../client.js';
import { TVShowMapper } from '../mappers/tvShowMapper.js';

export class PrismaTVShowRepository implements TVShowRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(show: TVShow): Promise<void> {
    await this.prisma.tVShow.upsert({
      where: { id: show.id },
      create: TVShowMapper.toCreateInput(show),
      update: TVShowMapper.toUpdateInput(show),
    });
  }

  async findById(id: string): Promise<TVShow | null> {
    const record = await this.prisma.tVShow.findFirst({ where: { id, deletedAt: null } });
    return record ? TVShowMapper.toDomain(record) : null;
  }

  async findByTmdbId(id: string): Promise<TVShow | null> {
    const record = await this.prisma.tVShow.findFirst({ where: { tmdbId: id, deletedAt: null } });
    return record ? TVShowMapper.toDomain(record) : null;
  }

  async list(): Promise<TVShow[]> {
    const records = await this.prisma.tVShow.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => TVShowMapper.toDomain(record));
  }
}
