import type { MediaCategory } from '@ctv-platform/domain';
import type { ImportPriorityEnum } from './enums.js';

/** Movies and shows are discovered/imported top-level; episodes are imported as part of a show. */
export type ImportableCategory = Exclude<MediaCategory, 'episode'>;

/**
 * Identifiers used by the matching chain, extracted from a provider DTO's
 * `raw` passthrough field (see `matching/extractExternalIdentifiers.ts`).
 * Any provider may populate these under this conventional shape.
 */
export interface ExternalContentIdentifiers {
  readonly imdbId?: string;
  readonly tmdbId?: string;
  readonly originalTitle?: string;
  readonly releaseYear?: number;
}

export interface ImportRequest {
  readonly providerId: string;
  readonly providerContentId: string;
  readonly category: ImportableCategory;
  readonly priority?: ImportPriorityEnum;
}
