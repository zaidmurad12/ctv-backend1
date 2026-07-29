import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DatabaseHealthCheck,
  RedisHealthCheck,
  createAppConfig,
  createRedisConnection,
} from '@ctv-platform/infrastructure';
import { Public } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';

const START_TIME = Date.now();
const VERSION = '1.0.0';
const HEALTH_CHECK_TIMEOUT_MS = 1500;

function withTimeout(check: Promise<boolean>): Promise<boolean> {
  return Promise.race([
    check,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), HEALTH_CHECK_TIMEOUT_MS)),
  ]);
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Report database/redis health, version, and uptime' })
  async check(): Promise<{
    status: string;
    version: string;
    uptimeSeconds: number;
    database: boolean;
    redis: boolean;
  }> {
    const config = createAppConfig();
    const redis = createRedisConnection(config.redis);
    // Prevent ioredis from logging an "Unhandled error event" for the
    // connection failure this check deliberately tolerates.
    redis.on('error', () => {});

    // `createRedisConnection` sets `maxRetriesPerRequest: null` for long-lived
    // BullMQ workers, which would make a PING retry forever against an
    // unreachable Redis. Each check races an independent timeout so one
    // slow dependency never masks the other's real status.
    const [database, redisHealthy] = await Promise.all([
      withTimeout(new DatabaseHealthCheck(this.prismaService.client).check()),
      withTimeout(new RedisHealthCheck(redis).check()),
    ]);
    redis.disconnect();

    return {
      status: database && redisHealthy ? 'healthy' : 'degraded',
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - START_TIME) / 1000),
      database,
      redis: redisHealthy,
    };
  }
}
