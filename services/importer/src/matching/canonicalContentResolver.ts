import { randomUUID } from 'node:crypto';
import type { Movie, MovieRepository, TVShow, TVShowRepository } from '@ctv-platform/domain';
import { MovieFactory, TVShowFactory } from '@ctv-platform/domain';
import type { ContentProviderLinkPort } from '../persistence/ports.js';
import { MovieDuplicateDetector, ShowDuplicateDetector } from './duplicateDetector.js';

export interface ResolvedMovie {
  readonly movie: Movie;
  readonly isNew: boolean;
}

export interface ResolvedShow {
  readonly show: TVShow;
  readonly isNew: boolean;
}

/**
 * Resolves a discovered content item to its canonical domain aggregate:
 * reuses the existing Movie/TVShow if one is already linked to this
 * provider (or matched by TMDB id), otherwise creates a brand new aggregate.
 * The caller is responsible for persisting it and creating the provider
 * link afterwards, once the entity has a durable id.
 */
export class CanonicalMovieResolver {
  private readonly detector: MovieDuplicateDetector;

  constructor(
    links: ContentProviderLinkPort,
    private readonly movies: MovieRepository,
  ) {
    this.detector = new MovieDuplicateDetector(links, movies);
  }

  async resolve(
    providerDbId: string,
    externalId: string,
    title: string,
    tmdbId?: string,
  ): Promise<ResolvedMovie> {
    const existingId = await this.detector.findExistingId(providerDbId, externalId, tmdbId);
    if (existingId) {
      const existing = await this.movies.findById(existingId);
      if (existing) {
        return { movie: existing, isNew: false };
      }
    }
    return { movie: MovieFactory.create({ id: randomUUID(), title }), isNew: true };
  }
}

export class CanonicalShowResolver {
  private readonly detector: ShowDuplicateDetector;

  constructor(
    links: ContentProviderLinkPort,
    private readonly shows: TVShowRepository,
  ) {
    this.detector = new ShowDuplicateDetector(links, shows);
  }

  async resolve(
    providerDbId: string,
    externalId: string,
    title: string,
    tmdbId?: string,
  ): Promise<ResolvedShow> {
    const existingId = await this.detector.findExistingId(providerDbId, externalId, tmdbId);
    if (existingId) {
      const existing = await this.shows.findById(existingId);
      if (existing) {
        return { show: existing, isNew: false };
      }
    }
    return { show: TVShowFactory.create({ id: randomUUID(), title }), isNew: true };
  }
}
