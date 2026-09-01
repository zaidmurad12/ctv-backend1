import { err, ok } from '@ctv-platform/domain';
import type { Movie, TVShow } from '@ctv-platform/domain';
import { ImportFailureCategoryEnum } from '../enums.js';
import { ImportError, type ImportResult } from '../errors.js';
import type { CacheInvalidator } from './cacheInvalidator.js';
import type { CatalogPublisher } from './catalogPublisher.js';
import type { EventPublisher } from './eventPublisher.js';
import type { SearchIndexUpdater } from './searchIndexUpdater.js';

export interface PublishOutcome {
  readonly contentId: string;
  readonly linkId: string;
}

const STAGE = 'publishing';

/**
 * Composes Catalog Update -> Cache Invalidation -> Event Publishing ->
 * Search Index Update. Each dependency does exactly one real thing; this
 * class only sequences them and turns unexpected failures into a
 * standardized `ImportResult`.
 */
export class PublishingPipeline {
  constructor(
    private readonly catalogPublisher: CatalogPublisher,
    private readonly cacheInvalidator: CacheInvalidator,
    private readonly eventPublisher: EventPublisher,
    private readonly searchIndexUpdater: SearchIndexUpdater,
  ) {}

  async publishMovie(
    movie: Movie,
    providerDbId: string,
    externalId: string,
    isAvailable: boolean,
  ): Promise<ImportResult<PublishOutcome>> {
    try {
      const linkId = await this.catalogPublisher.publishMovie(
        movie,
        providerDbId,
        externalId,
        isAvailable,
      );
      this.eventPublisher.publish(movie);
      await this.cacheInvalidator.invalidateMovie(movie.id);
      this.searchIndexUpdater.requestUpdate(movie.id, 'movie');
      return ok({ contentId: movie.id, linkId });
    } catch (error) {
      return err(this.toImportError(error));
    }
  }

  async publishShow(
    show: TVShow,
    providerDbId: string,
    externalId: string,
    isAvailable: boolean,
  ): Promise<ImportResult<PublishOutcome>> {
    try {
      const linkId = await this.catalogPublisher.publishShow(
        show,
        providerDbId,
        externalId,
        isAvailable,
      );
      this.eventPublisher.publish(show);
      await this.cacheInvalidator.invalidateShow(show.id);
      this.searchIndexUpdater.requestUpdate(show.id, 'show');
      return ok({ contentId: show.id, linkId });
    } catch (error) {
      return err(this.toImportError(error));
    }
  }

  private toImportError(error: unknown): ImportError {
    const message = error instanceof Error ? error.message : 'Unknown publishing failure.';
    return new ImportError(ImportFailureCategoryEnum.UNKNOWN_ERROR, STAGE, message, {
      cause: error,
    });
  }
}
