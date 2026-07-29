import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CatalogListQueryDto } from './dto.js';
import type { EpisodeSummaryDto, SeasonSummaryDto, ShowDetailDto, ShowSummaryDto } from './dto.js';
import { ShowsUseCases } from './useCases.js';
import { type Page } from './useCases.js';

const MOVIES_THROTTLE = { default: { limit: 120, ttl: 60_000 } };

@ApiTags('shows')
@Throttle(MOVIES_THROTTLE)
@Controller('shows')
export class ShowsController {
  constructor(private readonly showsUseCases: ShowsUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List TV shows with search/sort/pagination' })
  list(@Query() query: CatalogListQueryDto): Promise<Page<ShowSummaryDto>> {
    return this.showsUseCases.list(query);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Newest published TV shows' })
  latest(): Promise<ShowSummaryDto[]> {
    return this.showsUseCases.listBySort('newest', 20);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Most popular TV shows' })
  popular(): Promise<ShowSummaryDto[]> {
    return this.showsUseCases.listBySort('popularity', 20);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Highest rated TV shows' })
  trending(): Promise<ShowSummaryDto[]> {
    return this.showsUseCases.listBySort('rating', 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Show details, including its seasons' })
  getById(@Param('id') id: string): Promise<ShowDetailDto> {
    return this.showsUseCases.getById(id);
  }

  @Get(':id/seasons')
  @ApiOperation({ summary: 'Seasons for a show' })
  seasons(@Param('id') id: string): Promise<SeasonSummaryDto[]> {
    return this.showsUseCases.seasons(id);
  }

  @Get(':id/episodes')
  @ApiOperation({ summary: 'Every episode across every season of a show' })
  episodes(@Param('id') id: string): Promise<EpisodeSummaryDto[]> {
    return this.showsUseCases.episodes(id);
  }
}
