import type { ArtworkDto } from '../dto.js';

interface ImageRow {
  type: string;
  url: string;
}

const TYPE_TO_FIELD: Record<string, keyof ArtworkDto> = {
  POSTER: 'poster',
  BACKDROP: 'backdrop',
  LOGO: 'logo',
  THUMBNAIL: 'thumbnail',
  STILL: 'still',
};

// Some TMDB title logos are SVG files, which the TV app's image view can't draw at all (the logo
// just didn't show). TMDB serves the same logo rasterized when the address ends in .png instead, so
// the app is always handed that. Any #dark/#light mark after the name is kept.
export function renderableLogo(url: string): string {
  return url.replace(/^(https?:\/\/image\.tmdb\.org\/t\/p\/[^#?]+)\.svg(?=$|[#?])/i, '$1.png');
}

/** Maps `Image` rows (written by the import pipeline) into a flat artwork object. */
export function mapImagesToArtwork(images: readonly ImageRow[]): ArtworkDto {
  const artwork: ArtworkDto = {};
  for (const image of images) {
    const field = TYPE_TO_FIELD[image.type];
    // The last one of each type wins, as it always did (switching this to the first, briefly,
    // changed the horizontal poster on every title holding several). The admin panel shows this
    // same pick (see adminShowsRepository/adminMoviesRepository).
    if (field) {
      artwork[field] = image.url;
    }
  }
  if (artwork.logo) artwork.logo = renderableLogo(artwork.logo);
  return artwork;
}

/**
 * The title's own `logo` column is where the nightly backfill-logos / backfill-logo-tone scripts
 * write: a logo found later, and the `#dark`/`#light` mark the app uses to draw near-black logos
 * white. The API only ever read the Image rows, so neither ever reached the app. Now: the stored
 * logo fills in when there's no Image-row logo, and its tone mark is carried onto the Image-row logo
 * when both are the same file.
 */
export function withStoredLogo(artwork: ArtworkDto, storedLogo?: string | null): ArtworkDto {
  if (!storedLogo) return artwork;
  if (!artwork.logo) return { ...artwork, logo: renderableLogo(storedLogo) };
  const hash = storedLogo.indexOf('#');
  if (hash < 0 || artwork.logo.includes('#')) return artwork;
  const fileName = (url: string) => (url.split('/').pop() ?? url).replace(/\.(svg|png)$/i, '');
  return fileName(artwork.logo) === fileName(storedLogo.slice(0, hash))
    ? { ...artwork, logo: `${artwork.logo}${storedLogo.slice(hash)}` }
    : artwork;
}
