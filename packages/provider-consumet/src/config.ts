import { z } from 'zod';

/**
 * The only file in this package that reads `process.env`, per the convention
 * documented in `packages/sdk/src/config.ts` ("concrete providers own reading
 * their own environment variables"). Everything else in this package takes
 * plain values/objects so it stays independently testable.
 */
const consumetEnvSchema = z.object({
  PROVIDER_CONSUMET_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  PROVIDER_CONSUMET_BASE_URL: z.string().url().default('http://localhost:4000'),
  PROVIDER_CONSUMET_SOURCE: z.string().min(1).default('flixhq'),
  PROVIDER_CONSUMET_PRIORITY: z.coerce.number().int().positive().default(50),
  PROVIDER_CONSUMET_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  PROVIDER_CONSUMET_MAX_RPS: z.coerce.number().int().positive().default(5),
  PROVIDER_CONSUMET_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21600),
});

export interface ConsumetEnvConfig {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly source: string;
  readonly priority: number;
  readonly timeoutMs: number;
  readonly maxRequestsPerSecond: number;
  readonly cacheTtlSeconds: number;
}

/** Validates and fills in defaults for Consumet's own environment variables. */
export function readConsumetEnv(
  env: Record<string, string | undefined> = process.env,
): ConsumetEnvConfig {
  const parsed = consumetEnvSchema.parse(env);
  return {
    enabled: parsed.PROVIDER_CONSUMET_ENABLED,
    baseUrl: parsed.PROVIDER_CONSUMET_BASE_URL,
    source: parsed.PROVIDER_CONSUMET_SOURCE,
    priority: parsed.PROVIDER_CONSUMET_PRIORITY,
    timeoutMs: parsed.PROVIDER_CONSUMET_TIMEOUT_MS,
    maxRequestsPerSecond: parsed.PROVIDER_CONSUMET_MAX_RPS,
    cacheTtlSeconds: parsed.PROVIDER_CONSUMET_CACHE_TTL_SECONDS,
  };
}

/** Convenience guard so call sites don't need to know the schema shape. */
export function isConsumetEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return readConsumetEnv(env).enabled;
}
