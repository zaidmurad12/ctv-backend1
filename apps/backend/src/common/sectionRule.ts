export interface SectionRule {
  media: 'movie' | 'series' | 'all';
  // sourceAdded: the titles the sources most recently added (as reported by the TVs - see
  // admin/sourceLatest.ts), newest first; the other filters don't apply to it.
  sort: 'newest' | 'rating' | 'popularity' | 'sourceAdded';
  language?: string;
  genre?: string;
  country?: string;
  person?: string;
  collection?: string;
  yearFrom?: number;
  yearTo?: number;
  minVotes?: number;
  // Lowest rating (0-10) a title may have to appear.
  minRating?: number;
}

// The column is untyped JSON - fall back to safe defaults rather than trusting its shape.
export function parseSectionRule(value: unknown): SectionRule {
  const v = (value ?? {}) as Partial<SectionRule>;
  return {
    media: v.media === 'movie' || v.media === 'series' ? v.media : 'all',
    sort:
      v.sort === 'rating' || v.sort === 'popularity' || v.sort === 'sourceAdded'
        ? v.sort
        : 'newest',
    language: typeof v.language === 'string' && v.language ? v.language : undefined,
    genre: typeof v.genre === 'string' && v.genre ? v.genre : undefined,
    country:
      typeof v.country === 'string' && v.country.trim()
        ? v.country.trim().slice(0, 100)
        : undefined,
    person:
      typeof v.person === 'string' && v.person.trim() ? v.person.trim().slice(0, 100) : undefined,
    collection:
      typeof v.collection === 'string' && v.collection.trim()
        ? v.collection.trim().slice(0, 120)
        : undefined,
    yearFrom:
      typeof v.yearFrom === 'number' && v.yearFrom >= 1888 && v.yearFrom <= 2100
        ? Math.floor(v.yearFrom)
        : undefined,
    yearTo:
      typeof v.yearTo === 'number' && v.yearTo >= 1888 && v.yearTo <= 2100
        ? Math.floor(v.yearTo)
        : undefined,
    minVotes: typeof v.minVotes === 'number' && v.minVotes >= 0 ? v.minVotes : undefined,
    minRating: typeof v.minRating === 'number' && v.minRating > 0 ? v.minRating : undefined,
  };
}
