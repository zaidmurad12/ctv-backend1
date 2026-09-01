import type { ProviderMovieDto } from '@ctv-platform/sdk';

export interface EnrichmentFields {
  readonly rating?: number;
  readonly runtimeMinutes?: number;
  readonly trailerUrl?: string;
}

/**
 * `ProviderMovieDto` (defined generically in Milestone 3) has no dedicated
 * rating/runtime/trailer fields, since the content provider (e.g. Cinemana)
 * never supplies them — only a metadata-enrichment provider (e.g. TMDB)
 * does. Those providers pass them through the same `raw` passthrough
 * convention used for external ids.
 */
export function extractEnrichmentFields(dto: ProviderMovieDto): EnrichmentFields {
  const raw = dto.raw;
  const rating = typeof raw?.rating === 'number' ? raw.rating : undefined;
  const runtimeMinutes = typeof raw?.runtimeMinutes === 'number' ? raw.runtimeMinutes : undefined;
  const trailerUrl = typeof raw?.trailerUrl === 'string' ? raw.trailerUrl : undefined;
  return { rating, runtimeMinutes, trailerUrl };
}
