import { Module } from '@nestjs/common';
import { SearchQueryRepository } from './infrastructure/searchQueryRepository.js';
import { SearchController } from './search.controller.js';
import { SearchUseCases } from './useCases.js';

@Module({
  controllers: [SearchController],
  providers: [SearchQueryRepository, SearchUseCases],
})
export class SearchModule {}
