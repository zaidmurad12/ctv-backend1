import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicCache } from '../common/interceptors/publicCacheInterceptor.js';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../common/auth/authenticatedUser.js';
import { CurrentUser, Public } from '../common/decorators/decorators.js';
import { CatalogListQueryDto } from './dto.js';
import type {
  FeaturedItemDto,
  MovieDetailDto,
  MovieSummaryDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from './dto.js';
import { MoviesUseCases } from './useCases.js';
import { type Page } from './useCases.js';

/** specification/12-Security.md.txt "Rate Limiting: Movies 120 Requests / Minute". */
const MOVIES_THROTTLE = { default: { limit: 120, ttl: 60_000 } };

@ApiTags('movies')
@Throttle(MOVIES_THROTTLE)
@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesUseCases: MoviesUseCases) {}

  @PublicCache()
  @Public()
  @Get()
  @ApiOperation({ summary: 'List movies with search/sort/pagination' })
  list(@Query() query: CatalogListQueryDto): Promise<Page<MovieSummaryDto>> {
    return this.moviesUseCases.list(query);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Newest published movies' })
  latest(): Promise<MovieSummaryDto[]> {
    return this.moviesUseCases.listBySort('newest', 20);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Most popular movies' })
  popular(): Promise<MovieSummaryDto[]> {
    return this.moviesUseCases.listBySort('popularity', 20);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Highest rated movies' })
  trending(): Promise<MovieSummaryDto[]> {
    return this.moviesUseCases.listBySort('rating', 20);
  }

  @Get('top-rated')
  @ApiOperation({ summary: 'Highest rated movies with a meaningful vote count' })
  topRated(): Promise<MovieSummaryDto[]> {
    return this.moviesUseCases.topRated(20);
  }

  @PublicCache()
  @Public()
  @Get('featured')
  @ApiOperation({
    summary: 'Admin-curated home hero/banner carousel (movies and shows), in chosen order',
  })
  featured(): Promise<FeaturedItemDto[]> {
    return this.moviesUseCases.featured();
  }

  @ApiBearerAuth()
  @Get('recommended')
  @ApiOperation({ summary: 'Movies recommended for the authenticated user, based on genres' })
  recommended(@CurrentUser() user: AuthenticatedUser): Promise<MovieSummaryDto[]> {
    return this.moviesUseCases.recommended(user.userId, 20);
  }

  // Public like list()/getById() above - the app looks this up right after loading a movie's
  // own detail page (see collectionId on MovieDetailDto), same guest-accessible browsing flow.
  @PublicCache()
  @Public()
  @Get('collection/:collectionId')
  @ApiOperation({ summary: "Other parts sharing a movie's TMDB collection/franchise" })
  byCollection(
    @Param('collectionId') collectionId: string,
    @Query('exclude') exclude?: string,
  ): Promise<MovieSummaryDto[]> {
    return this.moviesUseCases.byCollection(collectionId, exclude);
  }

  // Matches `list()`'s @Public() above: the Android TV app browses movies without a login
  // gate, so a movie's own detail page (metadata only — streams/subtitles below stay
  // authenticated) must be reachable the same way, or tapping any browsed card 401s.
  @PublicCache()
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Movie details, including streams and subtitles' })
  getById(@Param('id') id: string): Promise<MovieDetailDto> {
    return this.moviesUseCases.getById(id);
  }

  @Get(':id/streams')
  @ApiOperation({ summary: 'Active streams for a movie' })
  streams(@Param('id') id: string): Promise<StreamResponseDto[]> {
    return this.moviesUseCases.streams(id);
  }

  @Get(':id/subtitles')
  @ApiOperation({ summary: 'Subtitles for a movie' })
  subtitles(@Param('id') id: string): Promise<SubtitleResponseDto[]> {
    return this.moviesUseCases.subtitles(id);
  }
}
