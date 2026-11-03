// Direct port of CinemanaTVRN/src/api.ts's normalizeTitle/extractImdbId/titleSimilarity/
// calculateMatchScore/matchTmdbWithCinemana (client-side, used there to match a TMDB-backed Movie
// against a cee/cinemana search result). Retargeted here from (Movie, CinemanaSearchItem) to
// (TmdbCandidate, SourceCatalogEntry) for the same purpose server-side.
//
// This is the FALLBACK path only - ScheduledImportService's primary match is an exact TMDB
// find-by-imdb-id lookup using the source entry's own imdbUrlRef, which needs no scoring at all.
// This module only runs when imdbUrlRef is missing or that lookup comes back empty.
import type { SourceCatalogEntry } from './sourceCatalogClient.js';

// Exported for ScheduledImportService's own catalog-to-source direction (subtitle backfill,
// dead-link healing) - same threshold, just applied the opposite way (searching a source for one
// of our own movies) via scoreMatch directly instead of pickBestMatch's own candidate-list loop.
export const MATCH_THRESHOLD = 85;

export interface TmdbCandidate {
  id: number;
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
}

export function normalizeTitle(value?: string | null): string {
  return (value ?? '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export function extractImdbId(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(?:imdb\.com\/title\/)?(tt\d{7,10})/i);
  return match?.[1]?.toLowerCase();
}

function titleSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const saved = previous[j];
      previous[j] =
        left[i - 1] === right[j - 1]
          ? diagonal
          : Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + 1);
      diagonal = saved;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function candidateTitle(candidate: TmdbCandidate): string {
  return candidate.title ?? candidate.name ?? '';
}

function candidateOriginalTitle(candidate: TmdbCandidate): string {
  return candidate.original_title ?? candidate.original_name ?? '';
}

function candidateYear(candidate: TmdbCandidate): number | undefined {
  const date = candidate.release_date ?? candidate.first_air_date;
  const year = date ? Number(date.slice(0, 4)) : undefined;
  return Number.isFinite(year) ? year : undefined;
}

export function scoreMatch(candidate: TmdbCandidate, entry: SourceCatalogEntry): number {
  const tmdbEnglish = normalizeTitle(candidateTitle(candidate));
  const tmdbOriginalEnglish = normalizeTitle(candidateOriginalTitle(candidate));
  const entryEnglish = normalizeTitle(entry.en_title);
  const entryArabic = normalizeTitle(entry.ar_title);
  const englishExact =
    (!!tmdbEnglish && tmdbEnglish === entryEnglish) ||
    (!!tmdbOriginalEnglish && tmdbOriginalEnglish === entryEnglish);
  const arabicExact = false; // TMDB candidates here carry no Arabic title to compare against entryArabic exactly.
  const fuzzy = Math.max(
    titleSimilarity(tmdbEnglish, entryEnglish),
    titleSimilarity(tmdbOriginalEnglish, entryEnglish),
    titleSimilarity(tmdbEnglish, entryArabic),
    titleSimilarity(tmdbOriginalEnglish, entryArabic),
  );
  const tmdbYear = candidateYear(candidate);
  const entryYear = entry.year != null ? Number(entry.year) : undefined;
  if (tmdbYear && entryYear && Math.abs(tmdbYear - entryYear) > 1) return 0;
  const yearScore =
    tmdbYear && entryYear
      ? tmdbYear === entryYear
        ? 20
        : Math.abs(tmdbYear - entryYear) === 1
          ? 8
          : 0
      : 0;
  return Math.min(
    100,
    15 + (englishExact ? 45 : 0) + (arabicExact ? 35 : 0) + Math.round(fuzzy * 25) + yearScore,
  );
}

export function pickBestMatch(
  candidates: TmdbCandidate[],
  entry: SourceCatalogEntry,
): { candidate: TmdbCandidate; score: number } | null {
  let best: TmdbCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreMatch(candidate, entry);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best && bestScore >= MATCH_THRESHOLD ? { candidate: best, score: bestScore } : null;
}
