import {
  createAppConfig,
  createRedisConnection,
  MemoryCache,
  RedisCacheClient,
  type CacheClient,
} from '@ctv-platform/infrastructure';

/**
 * Backs live provider-resolution caching (§3 of the Consumet plan): Redis
 * when reachable, an in-process `MemoryCache` otherwise, so a missing Redis
 * degrades caching rather than crashing the app. This is the first real
 * consumer of `@ctv-platform/infrastructure`'s cache client in `apps/backend`
 * — Redis is otherwise only used for BullMQ queues today.
 */
export function createProviderCacheClient(): CacheClient {
  try {
    const redis = createRedisConnection(createAppConfig().redis);
    redis.on('error', () => {
      // Swallow connection errors here; RedisCacheClient calls simply reject
      // and callers (ProviderStreamResolver) already treat cache misses/
      // failures as "no cached value," never as a fatal error.
    });
    return new RedisCacheClient(redis);
  } catch {
    return new MemoryCache();
  }
}
