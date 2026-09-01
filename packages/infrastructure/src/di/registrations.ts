import type {
  EpisodeRepository,
  MovieRepository,
  SeasonRepository,
  TVShowRepository,
} from '@ctv-platform/domain';
import type { AppConfig } from '../config/env.js';
import { DatabaseHealthCheck, HealthChecker, RedisHealthCheck } from '../health/checks.js';
import type { Logger } from '../logging/logger.js';
import { ConsoleLogger } from '../logging/logger.js';
import type { PrismaDatabaseClient } from '../prisma/client.js';
import { createPrismaClient } from '../prisma/client.js';
import { PrismaEpisodeRepository } from '../prisma/repositories/episodeRepository.js';
import { PrismaMovieRepository } from '../prisma/repositories/movieRepository.js';
import { PrismaSeasonRepository } from '../prisma/repositories/seasonRepository.js';
import { PrismaTVShowRepository } from '../prisma/repositories/tvShowRepository.js';
import type { UnitOfWork } from '../prisma/unitOfWork.js';
import { PrismaUnitOfWork } from '../prisma/unitOfWork.js';
import type { CacheClient } from '../redis/cache.js';
import { RedisCacheClient } from '../redis/cache.js';
import type { RedisConnection } from '../redis/client.js';
import { createRedisConnection } from '../redis/client.js';
import type { Container } from './container.js';
import { createContainer } from './container.js';
import { INFRA_TOKENS } from './tokens.js';

/**
 * Registers every infrastructure service in the given container as a
 * singleton, wired from the provided application configuration.
 */
export function registerInfrastructure(container: Container, config: AppConfig): Container {
  container.registerSingleton(INFRA_TOKENS.Config, () => config);
  container.registerSingleton<Logger>(
    INFRA_TOKENS.Logger,
    () => new ConsoleLogger(config.logging.level),
  );
  container.registerSingleton<PrismaDatabaseClient>(INFRA_TOKENS.PrismaClient, () =>
    createPrismaClient(config.database),
  );
  container.registerSingleton<RedisConnection>(INFRA_TOKENS.RedisConnection, () =>
    createRedisConnection(config.redis),
  );

  container.registerSingleton<MovieRepository>(
    INFRA_TOKENS.MovieRepository,
    () =>
      new PrismaMovieRepository(container.resolve<PrismaDatabaseClient>(INFRA_TOKENS.PrismaClient)),
  );
  container.registerSingleton<TVShowRepository>(
    INFRA_TOKENS.TVShowRepository,
    () =>
      new PrismaTVShowRepository(
        container.resolve<PrismaDatabaseClient>(INFRA_TOKENS.PrismaClient),
      ),
  );
  container.registerSingleton<SeasonRepository>(
    INFRA_TOKENS.SeasonRepository,
    () =>
      new PrismaSeasonRepository(
        container.resolve<PrismaDatabaseClient>(INFRA_TOKENS.PrismaClient),
      ),
  );
  container.registerSingleton<EpisodeRepository>(
    INFRA_TOKENS.EpisodeRepository,
    () =>
      new PrismaEpisodeRepository(
        container.resolve<PrismaDatabaseClient>(INFRA_TOKENS.PrismaClient),
      ),
  );
  container.registerSingleton<UnitOfWork>(
    INFRA_TOKENS.UnitOfWork,
    () => new PrismaUnitOfWork(container.resolve<PrismaDatabaseClient>(INFRA_TOKENS.PrismaClient)),
  );

  container.registerSingleton<CacheClient>(
    INFRA_TOKENS.CacheClient,
    () => new RedisCacheClient(container.resolve<RedisConnection>(INFRA_TOKENS.RedisConnection)),
  );
  container.registerSingleton<HealthChecker>(
    INFRA_TOKENS.HealthChecker,
    () =>
      new HealthChecker([
        new DatabaseHealthCheck(container.resolve<PrismaDatabaseClient>(INFRA_TOKENS.PrismaClient)),
        new RedisHealthCheck(container.resolve<RedisConnection>(INFRA_TOKENS.RedisConnection)),
      ]),
  );

  return container;
}

export function createInfrastructureContainer(config: AppConfig): Container {
  return registerInfrastructure(createContainer(), config);
}
