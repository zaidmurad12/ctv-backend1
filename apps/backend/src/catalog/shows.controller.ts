import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/decorators.js';
import { CatalogListQueryDto } from './dto.js';
import type { EpisodeSummaryDto, SeasonSummaryDto, ShowDetailDto, ShowSummaryDto } from './dto.js';
import { ShowsUseCases } from './useCases.js';
import { type Page } from './useCases.js';
import { PublicCache } from '../common/interceptors/publicCacheInterceptor.js';

const MOVIES_THROTTLE = { default: { limit: 120, ttl: 60_000 } };

// Mirrors MoviesController exactly - the Android TV app browses movies AND shows without a
// login gate, so every read-only route here needs the same @Public() treatment movies already
// got (see that controller's own comment). This was the one gap left over from that pass.
@ApiTags('shows')
@Throttle(MOVIES_THROTTLE)
@Controller('shows')
export class ShowsController {
  constructor(private readonly showsUseCases: ShowsUseCases) {}

  @PublicCache()
  @Public()
  @Get()
  @ApiOperation({ summary: 'List TV shows with search/sort/pagination' })
  list(@Query() query: CatalogListQueryDto): Promise<Page<ShowSummaryDto>> {
    return this.showsUseCases.list(query);
  }

  @PublicCache()
  @Public()
  @Get('latest')
  @ApiOperation({ summary: 'Newest published TV shows' })
  latest(): Promise<ShowSummaryDto[]> {
    return this.showsUseCases.listBySort('newest', 20);
  }

  @PublicCache()
  @Public()
  @Get('popular')
  @ApiOperation({ summary: 'Most popular TV shows' })
  popular(): Promise<ShowSummaryDto[]> {
    return this.showsUseCases.listBySort('popularity', 20);
  }

  @PublicCache()
  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Highest rated TV shows' })
  trending(): Promise<ShowSummaryDto[]> {
    return this.showsUseCases.listBySort('rating', 20);
  }

  @PublicCache()
  @Public()
  @Get('top-rated')
  @ApiOperation({ summary: 'Highest rated TV shows with a meaningful vote count' })
  topRated(): Promise<ShowSummaryDto[]> {
    return this.showsUseCases.topRated(20);
  }

  @PublicCache()
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Show details, including its seasons' })
  getById(@Param('id') id: string): Promise<ShowDetailDto> {
    return this.showsUseCases.getById(id);
  }

  @PublicCache()
  @Public()
  @Get(':id/seasons')
  @ApiOperation({ summary: 'Seasons for a show' })
  seasons(@Param('id') id: string): Promise<SeasonSummaryDto[]> {
    return this.showsUseCases.seasons(id);
  }

  @PublicCache()
  @Public()
  @Get(':id/episodes')
  @ApiOperation({ summary: 'Every episode across every season of a show' })
  episodes(@Param('id') id: string): Promise<EpisodeSummaryDto[]> {
    return this.showsUseCases.episodes(id);
  }
}
