import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/decorators.js';
import { SyncIssueRepository } from './infrastructure/syncIssueRepository.js';
import { ReportSyncIssueDto } from './dto.js';

// Public like movies/shows/subtitles - the app calls this itself, with no admin session, right
// after its own audio-sync feature (see VideoPlayer.tsx's onAutoSync) confidently detects a real
// mismatch. See SyncIssueRepository's own comment for what happens with a report once received.
@ApiTags('sync-issues')
@Controller('sync-issues')
export class SyncIssuesController {
  constructor(private readonly syncIssues: SyncIssueRepository) {}

  @Public()
  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Report a detected subtitle sync mismatch for a movie or episode' })
  report(@Body() dto: ReportSyncIssueDto): Promise<void> {
    return this.syncIssues.report(dto.movieId, dto.episodeId, dto.offsetMs, dto.speed);
  }
}
