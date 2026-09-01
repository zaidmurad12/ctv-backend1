import { z } from 'zod';

const retryConfigSchema = z.object({
  maxAttempts: z.number().int().positive().default(3),
  baseDelayMs: z.number().int().positive().default(500),
  maxDelayMs: z.number().int().positive().default(10000),
});

const providerConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().positive().default(30000),
  userAgent: z.string().min(1).default('CTV-Platform/1.0'),
  maxRequestsPerInterval: z.number().int().positive().default(10),
  intervalMs: z.number().int().positive().default(1000),
  retry: retryConfigSchema.default({}),
});

export type ProviderRetryConfig = z.infer<typeof retryConfigSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type ProviderConfigInput = z.input<typeof providerConfigSchema>;

/**
 * Validates and fills in defaults for a provider's runtime configuration.
 * Concrete providers own reading their own environment variables (e.g.
 * `CINEMANA_BASE_URL`) and pass the resolved values in here; the SDK itself
 * never reads `process.env` so it stays provider-agnostic.
 */
export function createProviderConfig(overrides: ProviderConfigInput = {}): ProviderConfig {
  return providerConfigSchema.parse(overrides);
}
