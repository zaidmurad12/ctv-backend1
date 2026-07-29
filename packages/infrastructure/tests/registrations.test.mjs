import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppConfig, createInfrastructureContainer, INFRA_TOKENS } from '../dist/index.js';

test('registerInfrastructure wires every infrastructure token as a resolvable singleton', async () => {
  const config = createAppConfig({});
  const container = createInfrastructureContainer(config);

  const prisma = container.resolve(INFRA_TOKENS.PrismaClient);
  const redis = container.resolve(INFRA_TOKENS.RedisConnection);

  try {
    assert.equal(container.resolve(INFRA_TOKENS.Config), config);
    assert.equal(
      container.resolve(INFRA_TOKENS.MovieRepository).constructor.name,
      'PrismaMovieRepository',
    );
    assert.equal(
      container.resolve(INFRA_TOKENS.TVShowRepository).constructor.name,
      'PrismaTVShowRepository',
    );
    assert.equal(
      container.resolve(INFRA_TOKENS.SeasonRepository).constructor.name,
      'PrismaSeasonRepository',
    );
    assert.equal(
      container.resolve(INFRA_TOKENS.EpisodeRepository).constructor.name,
      'PrismaEpisodeRepository',
    );
    assert.equal(container.resolve(INFRA_TOKENS.UnitOfWork).constructor.name, 'PrismaUnitOfWork');
    assert.equal(container.resolve(INFRA_TOKENS.CacheClient).constructor.name, 'RedisCacheClient');
    assert.equal(container.resolve(INFRA_TOKENS.HealthChecker).constructor.name, 'HealthChecker');

    // Resolving twice must yield the same singleton instance.
    assert.equal(container.resolve(INFRA_TOKENS.PrismaClient), prisma);
    assert.equal(container.resolve(INFRA_TOKENS.RedisConnection), redis);
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
});
