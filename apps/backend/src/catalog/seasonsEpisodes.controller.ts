import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/decorators.js';
import type {
  EpisodeDetailDto,
  EpisodeSummaryDto,
  SeasonDetailDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from './dto.js';
import { EpisodesUseCases, SeasonsUseCases } from './useCases.js';

// Same @Public() treatment as movies/shows (see shows.controller.ts's own comment) - the app
// browses and plays episodes without a login gate.
@ApiTags('seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsUseCases: SeasonsUseCases) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Season details, including its episodes' })
  getById(@Param('id') id: string): Promise<SeasonDetailDto> {
    return this.seasonsUseCases.getById(id);
  }

  @Public()
  @Get(':id/episodes')
  @ApiOperation({ summary: 'Episodes for a season' })
  episodes(@Param('id') id: string): Promise<EpisodeSummaryDto[]> {
    return this.seasonsUseCases.episodes(id);
  }
}

@ApiTags('episodes')
@Controller('episodes')
export class EpisodesController {
  constructor(private readonly episodesUseCases: EpisodesUseCases) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Episode details' })
  getById(@Param('id') id: string): Promise<EpisodeDetailDto> {
    return this.episodesUseCases.getById(id);
  }

  @Public()
  @Get(':id/streams')
  @ApiOperation({ summary: 'Active streams for an episode' })
  streams(@Param('id') id: string): Promise<StreamResponseDto[]> {
    return this.episodesUseCases.streams(id);
  }

  @Public()
  @Get(':id/subtitles')
  @ApiOperation({ summary: 'Subtitles for an episode' })
  subtitles(@Param('id') id: string): Promise<SubtitleResponseDto[]> {
    return this.episodesUseCases.subtitles(id);
  }
}
