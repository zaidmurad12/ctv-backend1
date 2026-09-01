import type { PrismaDatabaseClient } from '../prisma/client.js';
import type { RedisConnection } from '../redis/client.js';

export interface HealthCheck {
  name: string;
  check(): Promise<boolean>;
}

export class HealthChecker {
  constructor(private readonly checks: HealthCheck[]) {}

  async run(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const check of this.checks) {
      results[check.name] = await check.check();
    }
    return results;
  }
}

/**
 * Verifies the database connection is reachable by issuing a trivial query.
 */
export class DatabaseHealthCheck implements HealthCheck {
  readonly name = 'database';

  constructor(private readonly prisma: PrismaDatabaseClient) {}

  async check(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Verifies the Redis connection is reachable via PING.
 */
export class RedisHealthCheck implements HealthCheck {
  readonly name = 'redis';

  constructor(private readonly redis: RedisConnection) {}

  async check(): Promise<boolean> {
    try {
      const response = await this.redis.ping();
      return response === 'PONG';
    } catch {
      return false;
    }
  }
}
