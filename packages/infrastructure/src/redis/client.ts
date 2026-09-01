import { Redis } from 'ioredis';
import type { RedisConfig } from '../config/env.js';

export type RedisConnection = Redis;

/**
 * Creates a lazily-connecting Redis connection. `maxRetriesPerRequest: null`
 * is required so the same connection can be shared with BullMQ workers.
 */
export function createRedisConnection(config: RedisConfig): RedisConnection {
  return new Redis({
    host: config.host,
    port: config.port,
    password: config.password ?? undefined,
    db: config.db,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}
