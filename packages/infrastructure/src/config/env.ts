import { z } from 'zod';

export enum LoggerLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@localhost:5432/ctv'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  QUEUE_NAME: z.string().default('ctv-jobs'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface AppConfig {
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  queue: {
    name: string;
  };
  logging: {
    level: LoggerLevel;
  };
}

export function createAppConfig(values: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(values);
  return {
    database: {
      url: parsed.DATABASE_URL,
    },
    redis: {
      url: parsed.REDIS_URL,
    },
    queue: {
      name: parsed.QUEUE_NAME,
    },
    logging: {
      level: parsed.LOG_LEVEL as LoggerLevel,
    },
  };
}
