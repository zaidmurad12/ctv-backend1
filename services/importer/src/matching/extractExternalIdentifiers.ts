import type { ProviderMovieDto, ProviderShowDto } from '@ctv-platform/sdk';
import { extractReleaseYear } from '../metadata/metadataNormalizer.js';
import type { ExternalContentIdentifiers } from '../types.js';

function readStringField(
  raw: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = raw?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Providers pass external identifiers (IMDb id, TMDB id, ...) through their
 * DTO's `raw` passthrough field under these conventional keys — the
 * matching chain never assumes which provider populated them, keeping it
 * provider-agnostic.
 */
export function extractExternalIdentifiers(
  dto: ProviderMovieDto | ProviderShowDto,
): ExternalContentIdentifiers {
  const raw = 'raw' in dto ? dto.raw : undefined;
  return {
    imdbId: readStringField(raw, 'imdbId'),
    tmdbId: readStringField(raw, 'tmdbId'),
    originalTitle: dto.originalTitle,
    releaseYear: 'releaseDate' in dto ? extractReleaseYear(dto.releaseDate) : undefined,
  };
}
