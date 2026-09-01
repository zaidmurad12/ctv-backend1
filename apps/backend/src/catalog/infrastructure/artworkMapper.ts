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

/** Maps `Image` rows (written by the import pipeline) into a flat artwork object. */
export function mapImagesToArtwork(images: readonly ImageRow[]): ArtworkDto {
  const artwork: ArtworkDto = {};
  for (const image of images) {
    const field = TYPE_TO_FIELD[image.type];
    if (field) {
      artwork[field] = image.url;
    }
  }
  return artwork;
}
