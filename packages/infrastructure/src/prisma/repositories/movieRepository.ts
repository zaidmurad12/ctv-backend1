import type { Movie, MovieRepository } from '@ctv-platform/domain';
import type { PrismaDatabaseClient } from '../client.js';
import { MovieMapper } from '../mappers/movieMapper.js';

export class PrismaMovieRepository implements MovieRepository {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async save(movie: Movie): Promise<void> {
    await this.prisma.movie.upsert({
      where: { id: movie.id },
      create: MovieMapper.toCreateInput(movie),
      update: MovieMapper.toUpdateInput(movie),
    });
  }

  async findById(id: string): Promise<Movie | null> {
    const record = await this.prisma.movie.findFirst({ where: { id, deletedAt: null } });
    return record ? MovieMapper.toDomain(record) : null;
  }

  async findByTmdbId(id: string): Promise<Movie | null> {
    const record = await this.prisma.movie.findFirst({ where: { tmdbId: id, deletedAt: null } });
    return record ? MovieMapper.toDomain(record) : null;
  }

  async list(): Promise<Movie[]> {
    const records = await this.prisma.movie.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => MovieMapper.toDomain(record));
  }
}
