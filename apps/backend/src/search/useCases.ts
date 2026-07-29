import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '../common/dto/pagination.dto.js';
import type { Page } from '../catalog/useCases.js';
import type { SearchQueryDto, SearchResultItemDto } from './dto.js';
import { SearchQueryRepository } from './infrastructure/searchQueryRepository.js';

@Injectable()
export class SearchUseCases {
  constructor(private readonly searchRepository: SearchQueryRepository) {}

  async search(query: SearchQueryDto): Promise<Page<SearchResultItemDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.searchRepository.search(
      query.search,
      (page - 1) * limit,
      limit,
    );
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  suggest(term: string): Promise<string[]> {
    return this.searchRepository.suggest(term, 10);
  }
}
