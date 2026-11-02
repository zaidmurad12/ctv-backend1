import { Module } from '@nestjs/common';
import { CatalogRefreshService } from '../admin/infrastructure/catalogRefreshService.js';
import { TranslationBackfillService } from '../admin/infrastructure/translationBackfillService.js';
import { ScheduledImportService } from '../admin/infrastructure/scheduledImportService.js';
import { TmdbImportService } from '../admin/infrastructure/tmdbImportService.js';
import { TmdbLookupService } from '../admin/infrastructure/tmdbLookupService.js';
import { InternalController } from './internal.controller.js';

@Module({
  controllers: [InternalController],
  providers: [
    TranslationBackfillService,
    CatalogRefreshService,
    ScheduledImportService,
    // Registered here too (alongside AdminModule's own registration) - both are stateless, so
    // duplicating them is harmless and keeps InternalModule self-contained, matching this
    // module's existing convention of never importing AdminModule.
    TmdbImportService,
    TmdbLookupService,
  ],
})
export class InternalModule {}
