import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  EpisodeDetailDto,
  EpisodeSummaryDto,
  SeasonDetailDto,
  StreamResponseDto,
  SubtitleResponseDto,
} from './dto.js';
import { EpisodesUseCases, SeasonsUseCases } from './useCases.js';

@ApiTags('seasons')
@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsUseCases: SeasonsUseCases) {}

  @Get(':id')
  @ApiOperation({ summary: 'Season details, including its episodes' })
  getById(@Param('id') id: string): Promise<SeasonDetailDto> {
    return this.seasonsUseCases.getById(id);
  }

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

  @Get(':id')
  @ApiOperation({ summary: 'Episode details' })
  getById(@Param('id') id: string): Promise<EpisodeDetailDto> {
    return this.episodesUseCases.getById(id);
  }

  @Get(':id/streams')
  @ApiOperation({ summary: 'Active streams for an episode' })
  streams(@Param('id') id: string): Promise<StreamResponseDto[]> {
    return this.episodesUseCases.streams(id);
  }

  @Get(':id/subtitles')
  @ApiOperation({ summary: 'Subtitles for an episode' })
  subtitles(@Param('id') id: string): Promise<SubtitleResponseDto[]> {
    return this.episodesUseCases.subtitles(id);
  }
}
