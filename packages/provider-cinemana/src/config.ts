import { z } from 'zod';

/**
 * The only file in this package that reads `process.env`, per the same
 * convention `provider-consumet/src/config.ts` documents. Everything else in
 * this package takes plain values/objects so it stays independently testable.
 */
const cinemanaEnvSchema = z.object({
  PROVIDER_CINEMANA_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // No official public documentation for this API - it's the undocumented
  // backend the "Shabakaty Cinemana" Android app itself calls (see this
  // package's README for how that was found and the legal caveats around
  // using it). Kept overridable via env only so a changed upstream host
  // never needs a code change to recover from.
  PROVIDER_CINEMANA_BASE_URL: z.string().url().default('https://cinemana.shabakaty.com/api/android'),
  PROVIDER_CINEMANA_PRIORITY: z.coerce.number().int().positive().default(40),
  PROVIDER_CINEMANA_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  PROVIDER_CINEMANA_MAX_RPS: z.coerce.number().int().positive().default(5),
  PROVIDER_CINEMANA_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21600),
});

export interface CinemanaEnvConfig {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly priority: number;
  readonly timeoutMs: number;
  readonly maxRequestsPerSecond: number;
  readonly cacheTtlSeconds: number;
}

/** Validates and fills in defaults for Cinemana's own environment variables. */
export function readCinemanaEnv(
  env: Record<string, string | undefined> = process.env,
): CinemanaEnvConfig {
  const parsed = cinemanaEnvSchema.parse(env);
  return {
    enabled: parsed.PROVIDER_CINEMANA_ENABLED,
    baseUrl: parsed.PROVIDER_CINEMANA_BASE_URL,
    priority: parsed.PROVIDER_CINEMANA_PRIORITY,
    timeoutMs: parsed.PROVIDER_CINEMANA_TIMEOUT_MS,
    maxRequestsPerSecond: parsed.PROVIDER_CINEMANA_MAX_RPS,
    cacheTtlSeconds: parsed.PROVIDER_CINEMANA_CACHE_TTL_SECONDS,
  };
}

/** Convenience guard so call sites don't need to know the schema shape. */
export function isCinemanaEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return readCinemanaEnv(env).enabled;
}
