import type { Episode, EpisodeRepository } from '@ctv-platform/domain';
import type { PrismaDatabaseClient } from '../client.js';
import { EpisodeMapper } from '../mappers/episodeMapper.js';

export class PrismaEpisodeRepository implements EpisodeRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(episode: Episode): Promise<void> {
    await this.prisma.episode.upsert({
      where: { id: episode.id },
      create: EpisodeMapper.toCreateInput(episode),
      update: EpisodeMapper.toUpdateInput(episode),
    });
  }

  async findById(id: string): Promise<Episode | null> {
    const record = await this.prisma.episode.findUnique({ where: { id } });
    return record ? EpisodeMapper.toDomain(record) : null;
  }

  async findBySeasonId(seasonId: string): Promise<Episode[]> {
    const records = await this.prisma.episode.findMany({
      where: { seasonId },
      orderBy: { episodeNumber: 'asc' },
    });
    return records.map((record) => EpisodeMapper.toDomain(record));
  }
}
