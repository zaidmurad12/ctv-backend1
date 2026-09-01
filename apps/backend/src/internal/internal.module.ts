import { Module } from '@nestjs/common';
import { CatalogRefreshService } from '../admin/infrastructure/catalogRefreshService.js';
import { TranslationBackfillService } from '../admin/infrastructure/translationBackfillService.js';
import { InternalController } from './internal.controller.js';

@Module({
  controllers: [InternalController],
  providers: [TranslationBackfillService, CatalogRefreshService],
})
export class InternalModule {}
