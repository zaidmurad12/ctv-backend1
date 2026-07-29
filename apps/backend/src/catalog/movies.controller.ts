import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CatalogListQueryDto } from './dto.js';
import type {
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
