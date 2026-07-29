export const INFRA_TOKENS = {
  Config: 'infra.config',
  Logger: 'infra.logger',
  PrismaClient: 'infra.prismaClient',
  UnitOfWork: 'infra.unitOfWork',
  MovieRepository: 'infra.movieRepository',
  TVShowRepository: 'infra.tvShowRepository',
  SeasonRepository: 'infra.seasonRepository',
  EpisodeRepository: 'infra.episodeRepository',
  RedisConnection: 'infra.redisConnection',
  CacheClient: 'infra.cacheClient',
  HealthChecker: 'infra.healthChecker',
} as const;

export type InfraToken = (typeof INFRA_TOKENS)[keyof typeof INFRA_TOKENS];
