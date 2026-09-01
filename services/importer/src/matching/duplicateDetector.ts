import type { MovieRepository, TVShowRepository } from '@ctv-platform/domain';
import type { ContentProviderLinkPort } from '../persistence/ports.js';

/**
 * Primary duplicate-protection key per specification/08-Import-Pipeline.md.txt
 * ("Duplicate Protection: Provider ID Unique"): a content item already
 * exists in our database if a provider join row already links this
 * (provider, externalId) to a movie/show. A `tmdbId` cross-check is a
 * secondary safety net for the case where two different source-provider
 * items turn out to be the same real-world title.
 */
export class MovieDuplicateDetector {
  constructor(
    private readonly links: ContentProviderLinkPort,
    private readonly movies: MovieRepository,
  ) {}

  async findExistingId(
    providerDbId: string,
    externalId: string,
    tmdbId?: string,
  ): Promise<string | null> {
    const linked = await this.links.findMovieIdByExternalId(providerDbId, externalId);
    if (linked) {
      return linked;
    }
    if (tmdbId) {
      const byTmdbId = await this.movies.findByTmdbId(tmdbId);
      if (byTmdbId) {
        return byTmdbId.id;
      }
    }
    return null;
  }
}

export class ShowDuplicateDetector {
  constructor(
    private readonly links: ContentProviderLinkPort,
    private readonly shows: TVShowRepository,
  ) {}

  async findExistingId(
    providerDbId: string,
    externalId: string,
    tmdbId?: string,
  ): Promise<string | null> {
    const linked = await this.links.findShowIdByExternalId(providerDbId, externalId);
    if (linked) {
      return linked;
    }
    if (tmdbId) {
      const byTmdbId = await this.shows.findByTmdbId(tmdbId);
      if (byTmdbId) {
        return byTmdbId.id;
      }
    }
    return null;
  }
}
