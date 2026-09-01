import { UrlValue, ValidationError } from '@ctv-platform/domain';
import type { ProviderArtworkDto } from '@ctv-platform/sdk';
import type { ArtworkInput, ArtworkKind } from '../persistence/ports.js';

export interface ProcessedArtwork {
  readonly items: readonly ArtworkInput[];
  readonly issues: readonly string[];
}

const ARTWORK_KINDS: readonly ArtworkKind[] = ['poster', 'backdrop', 'logo', 'thumbnail', 'still'];

/**
 * Validates each artwork URL and prepares it for persistence. Pixel-level
 * processing (resize/compress/convert with Sharp, per
 * specification/03-Technology-Stack.md.txt) is a Milestone 8 (Optimization)
 * concern; this stage only ever handles URLs, never downloads image bytes.
 */
export function processArtwork(
  artwork: ProviderArtworkDto,
  providerName: string,
): ProcessedArtwork {
  const issues: string[] = [];
  const items: ArtworkInput[] = [];

  for (const kind of ARTWORK_KINDS) {
    const url = artwork[kind];
    if (!url) {
      continue;
    }
    try {
      UrlValue.create(url);
      items.push({ kind, url, provider: providerName });
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }
      issues.push(`artwork.${kind}: ${error.message}`);
    }
  }

  return { items, issues };
}
