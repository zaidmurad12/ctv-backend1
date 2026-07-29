import { normalizeArabicTitle, normalizeTitle } from '../metadata/metadataNormalizer.js';
import type { ExternalContentIdentifiers } from '../types.js';
import { titleSimilarity } from './similarity.js';

export type MatchMethod =
  | 'imdb_id'
  | 'tmdb_id'
  | 'exact_original_title'
  | 'exact_title'
  | 'normalized_arabic_title'
  | 'fuzzy';

export interface MatchCandidate {
  readonly id: string;
  readonly title: string;
  readonly originalTitle?: string;
  readonly releaseYear?: number;
  readonly imdbId?: string;
  readonly tmdbId?: string;
}

export interface MatchSource {
  readonly title: string;
  readonly identifiers: ExternalContentIdentifiers;
}

export type MatchOutcome =
  | {
      readonly matched: true;
      readonly candidate: MatchCandidate;
      readonly method: MatchMethod;
      readonly confidence: number;
    }
  | { readonly matched: false };

const NO_MATCH: MatchOutcome = { matched: false };

function sameYear(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined && a === b;
}

/**
 * Implements the matching priority chain from
 * specification/07-TMDB-Integration.md.txt: IMDb id -> TMDB id -> exact
 * original title + year -> exact title + year -> normalized Arabic title +
 * year -> fuzzy match (similarity above `fuzzyThreshold`). Entirely
 * provider-agnostic: it only ever looks at plain identifiers/strings.
 */
export class ContentMatcher {
  constructor(private readonly fuzzyThreshold: number) {}

  match(source: MatchSource, candidates: readonly MatchCandidate[]): MatchOutcome {
    return (
      this.matchByImdbId(source, candidates) ??
      this.matchByTmdbId(source, candidates) ??
      this.matchByExactOriginalTitle(source, candidates) ??
      this.matchByExactTitle(source, candidates) ??
      this.matchByNormalizedArabicTitle(source, candidates) ??
      this.matchByFuzzyTitle(source, candidates) ??
      NO_MATCH
    );
  }

  private matchByImdbId(
    source: MatchSource,
    candidates: readonly MatchCandidate[],
  ): MatchOutcome | undefined {
    if (!source.identifiers.imdbId) {
      return undefined;
    }
    const candidate = candidates.find((item) => item.imdbId === source.identifiers.imdbId);
    return candidate ? { matched: true, candidate, method: 'imdb_id', confidence: 1 } : undefined;
  }

  private matchByTmdbId(
    source: MatchSource,
    candidates: readonly MatchCandidate[],
  ): MatchOutcome | undefined {
    if (!source.identifiers.tmdbId) {
      return undefined;
    }
    const candidate = candidates.find((item) => item.tmdbId === source.identifiers.tmdbId);
    return candidate ? { matched: true, candidate, method: 'tmdb_id', confidence: 1 } : undefined;
  }

  private matchByExactOriginalTitle(
    source: MatchSource,
    candidates: readonly MatchCandidate[],
  ): MatchOutcome | undefined {
    const originalTitle = source.identifiers.originalTitle;
    if (!originalTitle) {
      return undefined;
    }
    const normalizedSource = normalizeTitle(originalTitle);
    const candidate = candidates.find(
      (item) =>
        item.originalTitle !== undefined &&
        normalizeTitle(item.originalTitle) === normalizedSource &&
        sameYear(item.releaseYear, source.identifiers.releaseYear),
    );
    return candidate
      ? { matched: true, candidate, method: 'exact_original_title', confidence: 1 }
      : undefined;
  }

  private matchByExactTitle(
    source: MatchSource,
    candidates: readonly MatchCandidate[],
  ): MatchOutcome | undefined {
    const normalizedSource = normalizeTitle(source.title);
    const candidate = candidates.find(
      (item) =>
        normalizeTitle(item.title) === normalizedSource &&
        sameYear(item.releaseYear, source.identifiers.releaseYear),
    );
    return candidate
      ? { matched: true, candidate, method: 'exact_title', confidence: 1 }
      : undefined;
  }

  private matchByNormalizedArabicTitle(
    source: MatchSource,
    candidates: readonly MatchCandidate[],
  ): MatchOutcome | undefined {
    const normalizedSource = normalizeArabicTitle(source.title);
    const candidate = candidates.find(
      (item) =>
        normalizeArabicTitle(item.title) === normalizedSource &&
        sameYear(item.releaseYear, source.identifiers.releaseYear),
    );
    return candidate
      ? { matched: true, candidate, method: 'normalized_arabic_title', confidence: 1 }
      : undefined;
  }

  private matchByFuzzyTitle(
    source: MatchSource,
    candidates: readonly MatchCandidate[],
  ): MatchOutcome | undefined {
    const normalizedSource = normalizeTitle(source.title);
    let best: { candidate: MatchCandidate; similarity: number } | null = null;

    for (const candidate of candidates) {
      const similarity = titleSimilarity(normalizeTitle(candidate.title), normalizedSource);
      if (similarity >= this.fuzzyThreshold && (!best || similarity > best.similarity)) {
        best = { candidate, similarity };
      }
    }

    return best
      ? { matched: true, candidate: best.candidate, method: 'fuzzy', confidence: best.similarity }
      : undefined;
  }
}
