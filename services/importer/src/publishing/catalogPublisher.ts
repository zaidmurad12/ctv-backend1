import { ContentDomainService } from '@ctv-platform/domain';
import type { Movie, MovieRepository, TVShow, TVShowRepository } from '@ctv-platform/domain';
import type { ContentProviderLinkPort } from '../persistence/ports.js';

/**
 * Persists the canonical aggregate, links it to its source provider, and
 * flips its availability via the domain's own `ContentDomainService`
 * (reused directly from Milestone 1 rather than re-implementing the
 * publish/remove rules).
 */
export class CatalogPublisher {
  private readonly contentService = new ContentDomainService();

  constructor(
    private readonly movies: MovieRepository,
    private readonly shows: TVShowRepository,
    private readonly links: ContentProviderLinkPort,
  ) {}

  async publishMovie(
    movie: Movie,
    providerDbId: string,
    externalId: string,
    isAvailable: boolean,
  ): Promise<string> {
    if (isAvailable) {
      this.contentService.publishIfEligible(movie);
    } else {
      this.contentService.removeIfEligible(movie);
    }
    await this.movies.save(movie);
    return this.links.ensureMovieLink(movie.id, providerDbId, externalId, movie.title.value);
  }

  async publishShow(
    show: TVShow,
    providerDbId: string,
    externalId: string,
    isAvailable: boolean,
  ): Promise<string> {
    if (isAvailable) {
      this.contentService.publishIfEligible(show);
    } else {
      this.contentService.removeIfEligible(show);
    }
    await this.shows.save(show);
    return this.links.ensureShowLink(show.id, providerDbId, externalId, show.title.value);
  }
}
