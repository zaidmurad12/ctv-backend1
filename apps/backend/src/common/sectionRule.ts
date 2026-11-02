export interface SectionRule {
  media: 'movie' | 'series' | 'all';
  sort: 'newest' | 'rating' | 'popularity';
  language?: string;
  genre?: string;
  minVotes?: number;
  // Lowest rating (0-10) a title may have to appear.
  minRating?: number;
}

// The column is untyped JSON - fall back to safe defaults rather than trusting its shape.
export function parseSectionRule(value: unknown): SectionRule {
  const v = (value ?? {}) as Partial<SectionRule>;
  return {
    media: v.media === 'movie' || v.media === 'series' ? v.media : 'all',
    sort: v.sort === 'rating' || v.sort === 'popularity' ? v.sort : 'newest',
    language: typeof v.language === 'string' && v.language ? v.language : undefined,
    genre: typeof v.genre === 'string' && v.genre ? v.genre : undefined,
    minVotes: typeof v.minVotes === 'number' && v.minVotes >= 0 ? v.minVotes : undefined,
    minRating: typeof v.minRating === 'number' && v.minRating > 0 ? v.minRating : undefined,
  };
}
