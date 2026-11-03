import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserResponseDto } from '../auth/dto.js';
import type { ArchiveSortBy } from './infrastructure/archiveOrgService.js';
import { Roles } from '../common/decorators/decorators.js';
import type { Page } from '../catalog/useCases.js';
import {
  AdminListMoviesQueryDto,
  AdminListShowsQueryDto,
  AdminListUsersQueryDto,
  CreateStreamDto,
  CreateSubtitleDto,
  DiscoverImportArchiveDto,
  DiscoverImportDto,
  DiscoverQueryDto,
  ImportSubtitleFromSearchDto,
  ImportWorkDto,
  SetFeaturedDto,
  UpdateMovieDto,
  UpdateProviderPriorityDto,
  UpdateShowDto,
  RestructureSeasonsDto,
  UpdateStreamDto,
  UpdateSubtitleDto,
  UpdateUserRoleDto,
  UploadSubtitleDto,
} from './dto.js';
import type {
  AdminFeaturedItemDto,
  AdminMovieDetailDto,
  AdminMovieSummaryDto,
  AdminShowDetailDto,
  AdminShowSummaryDto,
  ArchiveDiscoverCandidateDto,
  ArchiveImportResultDto,
  DashboardStatisticsDto,
  DiscoverCandidateDto,
  DiscoverImportResultDto,
  ProviderHealthSummaryDto,
  ProviderSummaryDto,
  SubtitleCandidateDto,
} from './dto.js';
import {
  CinemanaBackfillService,
  type BackfillScope,
} from './infrastructure/cinemanaBackfillService.js';
import {
  AdminDiscoverUseCases,
  AdminFeaturedUseCases,
  AdminMoviesUseCases,
  AdminShowsUseCases,
  AdminUsersUseCases,
  DashboardUseCases,
  ProvidersUseCases,
} from './useCases.js';

/** specification/12-Security.md.txt RBAC: every route here is Administrator only. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly usersUseCases: AdminUsersUseCases,
    private readonly moviesUseCases: AdminMoviesUseCases,
    private readonly showsUseCases: AdminShowsUseCases,
    private readonly featuredUseCases: AdminFeaturedUseCases,
    private readonly discoverUseCases: AdminDiscoverUseCases,
    private readonly dashboardUseCases: DashboardUseCases,
    private readonly providersUseCases: ProvidersUseCases,
    private readonly cinemanaBackfill: CinemanaBackfillService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  listUsers(@Query() query: AdminListUsersQueryDto): Promise<Page<UserResponseDto>> {
    return this.usersUseCases.list(query);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update a user’s role or active status' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserRoleDto): Promise<UserResponseDto> {
    return this.usersUseCases.updateUser(id, dto);
  }

  @Get('dashboard/statistics')
  @ApiOperation({ summary: 'Catalog and user counts' })
  statistics(): Promise<DashboardStatisticsDto> {
    return this.dashboardUseCases.getStatistics();
  }

  @Get('providers')
  @ApiOperation({ summary: 'List registered providers' })
  providers(): Promise<ProviderSummaryDto[]> {
    return this.providersUseCases.list();
  }

  @Post('sync/cinemana')
  @ApiOperation({ summary: 'Backfill Cinemana subtitles and missing streams for published works' })
  syncCinemana(
    @Query('limit') limit?: string,
    @Query('scope') scope?: BackfillScope,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.cinemanaBackfill.run(
      parsedLimit && parsedLimit > 0 ? parsedLimit : undefined,
      scope === 'movies' ? 'movies' : 'all',
      cursor,
    );
  }

  @Get('providers/health')
  @ApiOperation({ summary: 'Health-check every registered provider' })
  providersHealth(): Promise<ProviderHealthSummaryDto[]> {
    return this.providersUseCases.health();
  }

  @Post('providers/:id/discover')
  @ApiOperation({ summary: 'Trigger a manual discovery run for a registered provider' })
  discover(@Param('id') id: string): Promise<{ discovered: number }> {
    return this.providersUseCases.triggerDiscovery(id);
  }

  @Post('providers/:id/enable')
  @HttpCode(204)
  @ApiOperation({ summary: 'Enable a registered provider at runtime, no restart required' })
  enable(@Param('id') id: string): Promise<void> {
    return this.providersUseCases.setEnabled(id, true);
  }

  @Post('providers/:id/disable')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disable a registered provider at runtime, no restart required' })
  disable(@Param('id') id: string): Promise<void> {
    return this.providersUseCases.setEnabled(id, false);
  }

  @Patch('providers/:id/priority')
  @ApiOperation({ summary: "Change a provider's priority (lower number = higher priority)" })
  updatePriority(@Param('id') id: string, @Body() dto: UpdateProviderPriorityDto): Promise<void> {
    return this.providersUseCases.setPriority(id, dto.priority);
  }

  @Post('providers/:id/reload')
  @ApiOperation({ summary: "Re-run a single provider's health check on demand" })
  reload(@Param('id') id: string): Promise<ProviderHealthSummaryDto> {
    return this.providersUseCases.reload(id);
  }

  @Get('movies')
  @ApiOperation({ summary: 'List every movie regardless of status (draft/published/archived)' })
  listMovies(@Query() query: AdminListMoviesQueryDto): Promise<Page<AdminMovieSummaryDto>> {
    return this.moviesUseCases.list(query);
  }

  @Get('movies/filters')
  @ApiOperation({
    summary: 'Distinct genres/languages across all movies, for the list filter dropdowns',
  })
  movieFilterOptions(): Promise<{ genres: string[]; languages: string[] }> {
    return this.moviesUseCases.listFilterOptions();
  }

  @Get('featured')
  @ApiOperation({ summary: 'Current home hero/banner selection (movies and shows), in order' })
  listFeatured(): Promise<AdminFeaturedItemDto[]> {
    return this.featuredUseCases.list();
  }

  @Put('featured')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Replace the home hero/banner selection with this complete, ordered list of movies/shows',
  })
  setFeatured(@Body() dto: SetFeaturedDto): Promise<void> {
    return this.featuredUseCases.setFeatured(dto.items);
  }

  @Get('discover')
  @ApiOperation({
    summary:
      'Smart import: search TMDB by rating/year/genre/original language, excluding titles already in the catalog',
  })
  discoverTitles(@Query() query: DiscoverQueryDto): Promise<DiscoverCandidateDto[]> {
    return this.discoverUseCases.discover(query);
  }

  @Post('discover/import')
  @ApiOperation({ summary: 'Import a batch of TMDB ids returned by GET /admin/discover' })
  discoverImport(@Body() dto: DiscoverImportDto): Promise<DiscoverImportResultDto[]> {
    return this.discoverUseCases.import(dto);
  }

  // Same "search first, act second" shape as the TMDB discover pair above, sourced from Internet
  // Archive's public-domain feature_films collection instead - see ArchiveOrgService and
  // AdminDiscoverUseCases.discoverArchive/importArchive for why this needs a completely separate
  // pair rather than reusing discover()/discoverImport() (a different upstream search API, an
  // extra TMDB-title-match step, and a stricter refuse-if-unlicensed gate at import time).
  @Get('discover/archive')
  @ApiOperation({
    summary:
      'Smart import: search Internet Archive for public-domain feature films, cross-matched against TMDB for real metadata',
  })
  discoverArchive(
    @Query('q') q: string,
    @Query('start') start?: string,
    @Query('sortBy') sortBy?: ArchiveSortBy,
    @Query('genre') genre?: string,
    @Query('language') language?: string,
  ): Promise<ArchiveDiscoverCandidateDto[]> {
    return this.discoverUseCases.discoverArchive(
      q ?? '',
      start ? Number(start) : 0,
      sortBy ?? 'downloads',
      genre || undefined,
      language || undefined,
    );
  }

  @Post('discover/archive/import')
  @ApiOperation({
    summary:
      'Import a batch of Internet Archive identifiers returned by GET /admin/discover/archive - refuses any without a recognized public-domain/CC license or a TMDB match',
  })
  discoverImportArchive(@Body() dto: DiscoverImportArchiveDto): Promise<ArchiveImportResultDto[]> {
    return this.discoverUseCases.importArchive(dto.identifiers);
  }

  @Post('movies/import')
  @ApiOperation({ summary: 'Import a new movie from TMDB by id' })
  importMovie(@Body() dto: ImportWorkDto): Promise<{ id: string }> {
    return this.moviesUseCases.importNew(dto.tmdbId);
  }

  @Post('movies/:id/reimport')
  @ApiOperation({ summary: "Re-fetch a movie's info from TMDB using its stored tmdbId" })
  reimportMovie(@Param('id') id: string): Promise<{ id: string }> {
    return this.moviesUseCases.reimport(id);
  }

  @Delete('movies/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a movie (soft delete)' })
  deleteMovie(@Param('id') id: string): Promise<void> {
    return this.moviesUseCases.delete(id);
  }

  @Get('movies/:id')
  @ApiOperation({ summary: 'Movie details for editing, including its streams and subtitles' })
  getMovie(@Param('id') id: string): Promise<AdminMovieDetailDto> {
    return this.moviesUseCases.findById(id);
  }

  @Patch('movies/:id')
  @HttpCode(204)
  @ApiOperation({ summary: "Edit a movie's title/overview/status" })
  updateMovie(@Param('id') id: string, @Body() dto: UpdateMovieDto): Promise<void> {
    return this.moviesUseCases.update(id, dto);
  }

  @Post('movies/:id/streams')
  @HttpCode(204)
  @ApiOperation({ summary: 'Add a playback server to a movie' })
  addStream(@Param('id') id: string, @Body() dto: CreateStreamDto): Promise<void> {
    return this.moviesUseCases.addStream(id, dto);
  }

  @Patch('streams/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Edit a playback server' })
  updateStream(@Param('id') id: string, @Body() dto: UpdateStreamDto): Promise<void> {
    return this.moviesUseCases.updateStream(id, dto);
  }

  @Delete('streams/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a playback server' })
  deleteStream(@Param('id') id: string): Promise<void> {
    return this.moviesUseCases.deleteStream(id);
  }

  @Post('movies/:id/subtitles')
  @HttpCode(204)
  @ApiOperation({ summary: 'Add a subtitle file to a movie' })
  addSubtitle(@Param('id') id: string, @Body() dto: CreateSubtitleDto): Promise<void> {
    return this.moviesUseCases.addSubtitle(id, dto);
  }

  @Patch('subtitles/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Edit a subtitle' })
  updateSubtitle(@Param('id') id: string, @Body() dto: UpdateSubtitleDto): Promise<void> {
    return this.moviesUseCases.updateSubtitle(id, dto);
  }

  @Delete('subtitles/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a subtitle' })
  deleteSubtitle(@Param('id') id: string): Promise<void> {
    return this.moviesUseCases.deleteSubtitle(id);
  }

  @Get('movies/:id/subtitle-search')
  @ApiOperation({ summary: 'Search OpenSubtitles for candidate subtitles for a movie' })
  searchSubtitles(
    @Param('id') id: string,
    @Query('language') language = 'ar',
  ): Promise<SubtitleCandidateDto[]> {
    return this.moviesUseCases.searchSubtitles(id, language);
  }

  @Get('movies/:id/subtitle-search-by-hash')
  @ApiOperation({
    summary: "Search OpenSubtitles by this movie's own file hash - see MovieHashService",
  })
  searchSubtitlesByHash(
    @Param('id') id: string,
    @Query('language') language = 'ar',
  ): Promise<SubtitleCandidateDto[]> {
    return this.moviesUseCases.searchSubtitlesByHash(id, language);
  }

  @Post('movies/:id/subtitles/import')
  @HttpCode(204)
  @ApiOperation({ summary: 'Attach an OpenSubtitles search result to a movie' })
  importSubtitle(@Param('id') id: string, @Body() dto: ImportSubtitleFromSearchDto): Promise<void> {
    return this.moviesUseCases.importSubtitle(id, dto.fileId, dto.language);
  }

  @Post('movies/:id/subtitles/upload')
  @HttpCode(204)
  @ApiOperation({ summary: 'Attach a subtitle file the admin already has locally, sent as text' })
  uploadSubtitle(@Param('id') id: string, @Body() dto: UploadSubtitleDto): Promise<void> {
    return this.moviesUseCases.uploadSubtitle(id, dto.language, dto.format ?? 'srt', dto.content);
  }

  // --- TV shows: same shape as movies above (list/import/delete/reimport/edit). A show itself
  // never has playable streams/subtitles - only its episodes do, so those attach through the
  // episode-scoped routes below instead of a movies-style `shows/:id/streams`. Editing or
  // removing a stream/subtitle once it exists reuses the exact same PATCH/DELETE
  // `streams/:id`/`subtitles/:id` routes above - Stream/Subtitle rows are looked up by their own
  // id there regardless of whether a MovieProvider or EpisodeProvider owns them. -------------

  @Get('shows')
  @ApiOperation({ summary: 'List every TV show regardless of status (draft/published/archived)' })
  listShows(@Query() query: AdminListShowsQueryDto): Promise<Page<AdminShowSummaryDto>> {
    return this.showsUseCases.list(query);
  }

  @Get('shows/filters')
  @ApiOperation({
    summary: 'Distinct genres/languages across all shows, for the list filter dropdowns',
  })
  showFilterOptions(): Promise<{ genres: string[]; languages: string[] }> {
    return this.showsUseCases.listFilterOptions();
  }

  @Post('shows/import')
  @ApiOperation({ summary: 'Import a new TV show from TMDB by id' })
  importShow(@Body() dto: ImportWorkDto): Promise<{ id: string }> {
    return this.showsUseCases.importNew(dto.tmdbId);
  }

  @Post('shows/:id/reimport')
  @ApiOperation({
    summary: "Re-fetch a show's info (and its seasons/episodes) from TMDB using its stored tmdbId",
  })
  reimportShow(@Param('id') id: string): Promise<{ id: string }> {
    return this.showsUseCases.reimport(id);
  }

  @Post('shows/:id/refresh-episode-images')
  @ApiOperation({
    summary: "Re-fetch only a show's episode images from TMDB (nothing else is changed)",
  })
  refreshEpisodeImages(
    @Param('id') id: string,
  ): Promise<{
    updated: number;
    unchanged: number;
    missing: number;
    seasons: number;
    mode?: string;
  }> {
    return this.showsUseCases.refreshEpisodeImages(id);
  }

  @Delete('shows/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a TV show (soft delete)' })
  deleteShow(@Param('id') id: string): Promise<void> {
    return this.showsUseCases.delete(id);
  }

  @Get('shows/:id')
  @ApiOperation({
    summary: 'Show details for editing, including every season/episode and their streams/subtitles',
  })
  getShow(@Param('id') id: string): Promise<AdminShowDetailDto> {
    return this.showsUseCases.findById(id);
  }

  @Patch('shows/:id')
  @HttpCode(204)
  @ApiOperation({ summary: "Edit a show's title/overview/status" })
  updateShow(@Param('id') id: string, @Body() dto: UpdateShowDto): Promise<void> {
    return this.showsUseCases.update(id, dto);
  }

  @Post('shows/:id/restructure-seasons')
  @HttpCode(204)
  @ApiOperation({
    summary:
      "Re-split a show's existing episodes into a new season layout (keeps every episode's streams/history)",
  })
  restructureShowSeasons(
    @Param('id') id: string,
    @Body() dto: RestructureSeasonsDto,
  ): Promise<void> {
    return this.showsUseCases.restructureSeasons(id, dto);
  }

  @Post('episodes/:id/streams')
  @HttpCode(204)
  @ApiOperation({ summary: 'Add a playback server to an episode' })
  addEpisodeStream(@Param('id') id: string, @Body() dto: CreateStreamDto): Promise<void> {
    return this.showsUseCases.addEpisodeStream(id, dto);
  }

  @Post('episodes/:id/subtitles')
  @HttpCode(204)
  @ApiOperation({ summary: 'Add a subtitle file to an episode' })
  addEpisodeSubtitle(@Param('id') id: string, @Body() dto: CreateSubtitleDto): Promise<void> {
    return this.showsUseCases.addEpisodeSubtitle(id, dto);
  }

  @Get('episodes/:id/subtitle-search')
  @ApiOperation({ summary: 'Search OpenSubtitles for candidate subtitles for an episode' })
  searchEpisodeSubtitles(
    @Param('id') id: string,
    @Query('language') language = 'ar',
  ): Promise<SubtitleCandidateDto[]> {
    return this.showsUseCases.searchEpisodeSubtitles(id, language);
  }

  @Get('episodes/:id/subtitle-search-by-hash')
  @ApiOperation({
    summary: "Search OpenSubtitles by this episode's own file hash - see MovieHashService",
  })
  searchEpisodeSubtitlesByHash(
    @Param('id') id: string,
    @Query('language') language = 'ar',
  ): Promise<SubtitleCandidateDto[]> {
    return this.showsUseCases.searchEpisodeSubtitlesByHash(id, language);
  }

  @Post('episodes/:id/subtitles/import')
  @HttpCode(204)
  @ApiOperation({ summary: 'Attach an OpenSubtitles search result to an episode' })
  importEpisodeSubtitle(
    @Param('id') id: string,
    @Body() dto: ImportSubtitleFromSearchDto,
  ): Promise<void> {
    return this.showsUseCases.importEpisodeSubtitle(id, dto.fileId, dto.language);
  }

  @Post('episodes/:id/subtitles/upload')
  @HttpCode(204)
  @ApiOperation({ summary: 'Attach a subtitle file the admin already has locally, sent as text' })
  uploadEpisodeSubtitle(@Param('id') id: string, @Body() dto: UploadSubtitleDto): Promise<void> {
    return this.showsUseCases.uploadEpisodeSubtitle(
      id,
      dto.language,
      dto.format ?? 'srt',
      dto.content,
    );
  }
}
