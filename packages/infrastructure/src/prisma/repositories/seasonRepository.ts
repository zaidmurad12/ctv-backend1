import type { Season, SeasonRepository } from '@ctv-platform/domain';
import type { PrismaDatabaseClient } from '../client.js';
import { SeasonMapper } from '../mappers/seasonMapper.js';

export class PrismaSeasonRepository implements SeasonRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(season: Season): Promise<void> {
    await this.prisma.season.upsert({
      where: { id: season.id },
      create: SeasonMapper.toCreateInput(season),
      update: SeasonMapper.toUpdateInput(season),
    });
  }

  async findById(id: string): Promise<Season | null> {
    const record = await this.prisma.season.findUnique({ where: { id } });
    return record ? SeasonMapper.toDomain(record) : null;
  }

  async findByShowId(showId: string): Promise<Season[]> {
    const records = await this.prisma.season.findMany({
      where: { showId },
      orderBy: { seasonNumber: 'asc' },
    });
    return records.map((record) => SeasonMapper.toDomain(record));
  }
}
