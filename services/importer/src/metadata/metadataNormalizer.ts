const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٟۖ-ۜ۟-۪ۨ-ٰۭ]/g;
const TATWEEL = /ـ/g;

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Generic title normalization used for exact-title comparisons. */
export function normalizeTitle(value: string): string {
  return normalizeWhitespace(value).normalize('NFC').toLowerCase();
}

/**
 * Normalizes Arabic text for matching: strips diacritics/tatweel and unifies
 * the alef/yaa/taa-marbuta variants that are interchangeable in casual
 * Arabic writing, per specification/07-TMDB-Integration.md.txt ("Normalized
 * Arabic Title + Release Year").
 */
export function normalizeArabicTitle(value: string): string {
  return normalizeWhitespace(value)
    .normalize('NFC')
    .replace(ARABIC_DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

/** Extracts a 4-digit year from an ISO-ish release date string. */
export function extractReleaseYear(releaseDate: string | undefined): number | undefined {
  if (!releaseDate) {
    return undefined;
  }
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}
