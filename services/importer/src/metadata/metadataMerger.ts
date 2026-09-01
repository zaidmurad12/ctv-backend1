import type { ProviderArtworkDto, ProviderMovieDto, ProviderShowDto } from '@ctv-platform/sdk';

/**
 * specification/07-TMDB-Integration.md.txt "Images: Preferred Order: TMDB ->
 * Provider": the enrichment (metadata) source wins for descriptive/artwork
 * fields whenever it has a value. Availability, streams, and subtitles are
 * never touched here — per the same spec, those always belong to the
 * content provider.
 */
function mergeArtwork(
  base: ProviderArtworkDto,
  enrichment: ProviderArtworkDto,
): ProviderArtworkDto {
  return {
    poster: enrichment.poster ?? base.poster,
    backdrop: enrichment.backdrop ?? base.backdrop,
    logo: enrichment.logo ?? base.logo,
    thumbnail: enrichment.thumbnail ?? base.thumbnail,
    still: enrichment.still ?? base.still,
  };
}

export function mergeMovieMetadata(
  base: ProviderMovieDto,
  enrichment: ProviderMovieDto | null,
): ProviderMovieDto {
  if (!enrichment) {
    return base;
  }
  return {
    ...base,
    overview: enrichment.overview ?? base.overview,
    originalTitle: enrichment.originalTitle ?? base.originalTitle,
    releaseDate: enrichment.releaseDate ?? base.releaseDate,
    artwork: mergeArtwork(base.artwork, enrichment.artwork),
    raw: { ...base.raw, ...enrichment.raw },
  };
}

export function mergeShowMetadata(
  base: ProviderShowDto,
  enrichment: ProviderShowDto | null,
): ProviderShowDto {
  if (!enrichment) {
    return base;
  }
  return {
    ...base,
    overview: enrichment.overview ?? base.overview,
    originalTitle: enrichment.originalTitle ?? base.originalTitle,
    artwork: mergeArtwork(base.artwork, enrichment.artwork),
  };
}
