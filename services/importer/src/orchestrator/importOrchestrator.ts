import type { ProviderInterface } from '@ctv-platform/sdk';
import type { ImportResult } from '../errors.js';
import type { PublishOutcome } from '../publishing/index.js';
import type { ImportableCategory } from '../types.js';
import type { MovieImportOrchestrator } from './movieImportOrchestrator.js';
import type { ShowImportOrchestrator } from './showImportOrchestrator.js';

/** Dispatches a single content item to the movie or show pipeline. */
export class ImportOrchestrator {
  constructor(
    private readonly movieOrchestrator: MovieImportOrchestrator,
    private readonly showOrchestrator: ShowImportOrchestrator,
  ) {}

  importOne(
    provider: ProviderInterface,
    providerContentId: string,
    category: ImportableCategory,
  ): Promise<ImportResult<PublishOutcome>> {
    return category === 'movie'
      ? this.movieOrchestrator.importOne(provider, providerContentId)
      : this.showOrchestrator.importOne(provider, providerContentId);
  }
}
