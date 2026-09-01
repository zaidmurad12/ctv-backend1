import { z } from 'zod';

export enum LoggerLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://ctv:ctv@localhost:5432/ctv_dev'),
  DATABASE_POOL: z.coerce.number().int().positive().default(20),
  DATABASE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  DATABASE_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  QUEUE_PREFIX: z.string().min(1).default('ctv'),
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(10),
  QUEUE_RETRY: z.coerce.number().int().nonnegative().default(3),
  QUEUE_TIMEOUT: z.coerce.number().int().positive().default(300000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface DatabaseConfig {
  readonly url: string;
  readonly pool: number;
  readonly timeoutMs: number;
  readonly logging: boolean;
}

export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password: string | null;
  readonly db: number;
}

export interface QueueConfig {
  readonly prefix: string;
  readonly concurrency: number;
  readonly retry: number;
  readonly timeoutMs: number;
}

export interface LoggingConfig {
  readonly level: LoggerLevel;
}

export interface AppConfig {
  readonly database: DatabaseConfig;
  readonly redis: RedisConfig;
  readonly queue: QueueConfig;
  readonly logging: LoggingConfig;
}

export function createAppConfig(
  values: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = envSchema.parse(values);

  return {
    database: {
      url: parsed.DATABASE_URL,
      pool: parsed.DATABASE_POOL,
      timeoutMs: parsed.DATABASE_TIMEOUT,
      logging: parsed.DATABASE_LOGGING,
    },
    redis: {
      host: parsed.REDIS_HOST,
      port: parsed.REDIS_PORT,
      password: parsed.REDIS_PASSWORD ?? null,
      db: parsed.REDIS_DB,
    },
    queue: {
      prefix: parsed.QUEUE_PREFIX,
      concurrency: parsed.QUEUE_CONCURRENCY,
      retry: parsed.QUEUE_RETRY,
      timeoutMs: parsed.QUEUE_TIMEOUT,
    },
    logging: {
      level: parsed.LOG_LEVEL as LoggerLevel,
    },
  };
}
