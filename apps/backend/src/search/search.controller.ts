import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Page } from '../catalog/useCases.js';
import { SearchQueryDto, SuggestQueryDto } from './dto.js';
import type { SearchResultItemDto } from './dto.js';
import { SearchUseCases } from './useCases.js';

/** specification/12-Security.md.txt "Rate Limiting: Search 60 Requests / Minute". */
const SEARCH_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('search')
@Throttle(SEARCH_THROTTLE)
@Controller('search')
export class SearchController {
  constructor(private readonly searchUseCases: SearchUseCases) {}

  @Get()
  @ApiOperation({ summary: 'Search movies and TV shows by title (Arabic/English/mixed)' })
  search(@Query() query: SearchQueryDto): Promise<Page<SearchResultItemDto>> {
    return this.searchUseCases.search(query);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Autocomplete title suggestions' })
  suggestions(@Query() query: SuggestQueryDto): Promise<string[]> {
    return this.searchUseCases.suggest(query.search);
  }
}
