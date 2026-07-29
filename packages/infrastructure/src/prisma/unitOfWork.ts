import type {
  EpisodeRepository,
  MovieRepository,
  SeasonRepository,
  TVShowRepository,
} from '@ctv-platform/domain';
import type { PrismaDatabaseClient } from './client.js';
import { PrismaEpisodeRepository } from './repositories/episodeRepository.js';
import { PrismaMovieRepository } from './repositories/movieRepository.js';
import { PrismaSeasonRepository } from './repositories/seasonRepository.js';
import { PrismaTVShowRepository } from './repositories/tvShowRepository.js';

export interface UnitOfWorkRepositories {
  readonly movies: MovieRepository;
  readonly tvShows: TVShowRepository;
  readonly seasons: SeasonRepository;
  readonly episodes: EpisodeRepository;
}

export interface UnitOfWork {
  execute<T>(work: (repositories: UnitOfWorkRepositories) => Promise<T>): Promise<T>;
}

function createRepositories(client: PrismaDatabaseClient): UnitOfWorkRepositories {
  return {
    movies: new PrismaMovieRepository(client),
    tvShows: new PrismaTVShowRepository(client),
    seasons: new PrismaSeasonRepository(client),
    episodes: new PrismaEpisodeRepository(client),
  };
}

/**
 * Runs a unit of work inside a single Prisma transaction. Every repository
 * handed to the callback is bound to the transactional client, so writes
 * across aggregates either all commit or all roll back together.
 */
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async execute<T>(work: (repositories: UnitOfWorkRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const repositories = createRepositories(tx as PrismaDatabaseClient);
      return work(repositories);
    });
  }
}
