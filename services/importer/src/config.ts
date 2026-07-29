import { z } from 'zod';

const importPipelineConfigSchema = z.object({
  batchSize: z.number().int().positive().default(50),
  concurrency: z.number().int().positive().default(5),
  /** Scheduled discovery cadence. Defaults to the spec's "Daily Sync" (24h). */
  discoveryIntervalMs: z
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1000),
  maxJobAttempts: z.number().int().positive().default(3),
  /** specification/07-TMDB-Integration.md.txt "Fuzzy Match: Similarity > 90%". */
  fuzzyMatchThreshold: z.number().min(0).max(1).default(0.9),
});

export type ImportPipelineConfig = z.infer<typeof importPipelineConfigSchema>;
export type ImportPipelineConfigInput = z.input<typeof importPipelineConfigSchema>;

export function createImportPipelineConfig(
  overrides: ImportPipelineConfigInput = {},
): ImportPipelineConfig {
  return importPipelineConfigSchema.parse(overrides);
}
