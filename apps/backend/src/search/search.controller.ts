import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Page } from '../catalog/useCases.js';
import { Public } from '../common/decorators/decorators.js';
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

  // Public for the same reason as MoviesController.list()/getById(): the Android TV app
  // browses and searches without a login gate.
  @Public()
  @Get()
  @ApiOperation({ summary: 'Search movies and TV shows by title (Arabic/English/mixed)' })
  search(@Query() query: SearchQueryDto): Promise<Page<SearchResultItemDto>> {
    return this.searchUseCases.search(query);
  }

  @Public()
  @Get('suggestions')
  @ApiOperation({ summary: 'Autocomplete title suggestions' })
  suggestions(@Query() query: SuggestQueryDto): Promise<string[]> {
    return this.searchUseCases.suggest(query.search);
  }
}
