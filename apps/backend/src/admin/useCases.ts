import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { isOk } from '@ctv-platform/domain';
import { DiscoveryModeEnum } from '@ctv-platform/importer';
import { NotFoundError } from '@ctv-platform/domain';
import { buildPaginationMeta } from '../common/dto/pagination.dto.js';
import { USER_REPOSITORY, type UserRepository } from '../auth/ports.js';
import { UserResponseDto } from '../auth/dto.js';
import type { Page } from '../catalog/useCases.js';
import { ProviderRegistryRepository } from '../providers/infrastructure/providerRegistryRepository.js';
import { ProviderMetricsTracker } from '../providers/providerMetricsTracker.js';
import { ProvidersRuntime } from '../providers/providersRuntime.js';
import type {
  AdminFeaturedItemDto,
  AdminListMoviesQueryDto,
  AdminListShowsQueryDto,
  AdminListUsersQueryDto,
  AdminMovieDetailDto,
  AdminMovieSummaryDto,
  AdminShowDetailDto,
  AdminShowSummaryDto,
  ArchiveDiscoverCandidateDto,
  ArchiveImportResultDto,
  CreateStreamDto,
  CreateSubtitleDto,
  DashboardStatisticsDto,
  DiscoverCandidateDto,
  DiscoverImportDto,
  DiscoverImportResultDto,
  DiscoverQueryDto,
  FeaturedItemInputDto,
  ProviderHealthSummaryDto,
  ProviderSummaryDto,
  SubtitleCandidateDto,
  UpdateMovieDto,
  UpdateShowDto,
  RestructureSeasonsDto,
  UpdateStreamDto,
  UpdateSubtitleDto,
  UpdateUserRoleDto,
} from './dto.js';
import type { ArchiveSortBy } from './infrastructure/archiveOrgService.js';
import { ArchiveOrgService } from './infrastructure/archiveOrgService.js';
import { AdminMoviesRepository } from './infrastructure/adminMoviesRepository.js';
import { AdminShowsRepository } from './infrastructure/adminShowsRepository.js';
import { DashboardStatsRepository } from './infrastructure/dashboardStatsRepository.js';
import { TmdbDiscoverService } from './infrastructure/tmdbDiscoverService.js';
import { TmdbImportService } from './infrastructure/tmdbImportService.js';

@Injectable()
export class AdminUsersUseCases {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async list(query: AdminListUsersQueryDto): Promise<Page<UserResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.users.list({
      skip: (page - 1) * limit,
      take: limit,
      search: query.search,
    });
    return {
      items: items.map((user) => new UserResponseDto(user)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async updateUser(userId: string, dto: UpdateUserRoleDto): Promise<UserResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    if (dto.role !== undefined) {
      user.changeRole(dto.role);
    }
    if (dto.isActive !== undefined) {
      user.setActive(dto.isActive);
    }
    await this.users.save(user);
    return new UserResponseDto(user);
  }
}

@Injectable()
export class AdminMoviesUseCases {
  constructor(private readonly movies: AdminMoviesRepository) {}

  async list(query: AdminListMoviesQueryDto): Promise<Page<AdminMovieSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.movies.list({
      page,
      limit,
      search: query.search,
      genre: query.genre,
      language: query.language,
      hasStream: query.hasStream,
      hasSubtitle: query.hasSubtitle,
      hasSourceMatch: query.hasSourceMatch,
      sort: query.sort,
      status: query.status,
      missingArabicTitle: query.missingArabicTitle,
      missingArtwork: query.missingArtwork,
    });
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  listFilterOptions(): Promise<{ genres: string[]; languages: string[] }> {
    return this.movies.listFilterOptions();
  }

  importNew(tmdbId: string): Promise<{ id: string }> {
    return this.movies.importNew(tmdbId).then((id) => ({ id }));
  }

  reimport(id: string): Promise<{ id: string }> {
    return this.movies.reimport(id).then((newId) => ({ id: newId }));
  }

  delete(id: string): Promise<void> {
    return this.movies.delete(id);
  }

  async findById(id: string): Promise<AdminMovieDetailDto> {
    const movie = await this.movies.findById(id);
    if (!movie) throw new NotFoundException(`Movie "${id}" not found.`);
    return movie;
  }

  update(id: string, dto: UpdateMovieDto): Promise<void> {
    return this.movies.update(id, dto);
  }

  addStream(movieId: string, dto: CreateStreamDto): Promise<void> {
    return this.movies.addStream(movieId, dto);
  }

  updateStream(streamId: string, dto: UpdateStreamDto): Promise<void> {
    return this.movies.updateStream(streamId, dto);
  }

  deleteStream(streamId: string): Promise<void> {
    return this.movies.deleteStream(streamId);
  }

  addSubtitle(movieId: string, dto: CreateSubtitleDto): Promise<void> {
    return this.movies.addSubtitle(movieId, dto);
  }

  updateSubtitle(subtitleId: string, dto: UpdateSubtitleDto): Promise<void> {
    return this.movies.updateSubtitle(subtitleId, dto);
  }

  deleteSubtitle(subtitleId: string): Promise<void> {
    return this.movies.deleteSubtitle(subtitleId);
  }

  searchSubtitles(movieId: string, language: string): Promise<SubtitleCandidateDto[]> {
    return this.movies.searchSubtitles(movieId, language);
  }

  searchSubtitlesByHash(movieId: string, language: string): Promise<SubtitleCandidateDto[]> {
    return this.movies.searchSubtitlesByHash(movieId, language);
  }

  importSubtitle(movieId: string, fileId: string, language: string): Promise<void> {
    return this.movies.importSubtitle(movieId, fileId, language);
  }

  uploadSubtitle(
    movieId: string,
    language: string,
    format: string,
    content: string,
  ): Promise<void> {
    return this.movies.uploadSubtitle(movieId, language, format, content);
  }
}

@Injectable()
export class AdminShowsUseCases {
  constructor(private readonly shows: AdminShowsRepository) {}

  async list(query: AdminListShowsQueryDto): Promise<Page<AdminShowSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.shows.list({
      page,
      limit,
      search: query.search,
      genre: query.genre,
      language: query.language,
      missingStream: query.missingStream,
      missingSubtitle: query.missingSubtitle,
      hasAnyStream: query.hasAnyStream,
      sort: query.sort,
      hasSourceMatch: query.hasSourceMatch,
      status: query.status,
      missingArabicTitle: query.missingArabicTitle,
      missingArtwork: query.missingArtwork,
    });
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  listFilterOptions(): Promise<{ genres: string[]; languages: string[] }> {
    return this.shows.listFilterOptions();
  }

  importNew(tmdbId: string): Promise<{ id: string }> {
    return this.shows.importNew(tmdbId).then((id) => ({ id }));
  }

  reimport(id: string): Promise<{ id: string }> {
    return this.shows.reimport(id).then((newId) => ({ id: newId }));
  }

  refreshEpisodeImages(id: string) {
    return this.shows.refreshEpisodeImages(id);
  }

  delete(id: string): Promise<void> {
    return this.shows.delete(id);
  }

  async findById(id: string): Promise<AdminShowDetailDto> {
    const show = await this.shows.findById(id);
    if (!show) throw new NotFoundException(`Show "${id}" not found.`);
    return show;
  }

  update(id: string, dto: UpdateShowDto): Promise<void> {
    return this.shows.update(id, dto);
  }

  restructureSeasons(id: string, dto: RestructureSeasonsDto): Promise<void> {
    return this.shows.restructureSeasons(id, dto.layout, dto.allowDelete ?? false);
  }

  addEpisodeStream(episodeId: string, dto: CreateStreamDto): Promise<void> {
    return this.shows.addEpisodeStream(episodeId, dto);
  }

  addEpisodeSubtitle(episodeId: string, dto: CreateSubtitleDto): Promise<void> {
    return this.shows.addEpisodeSubtitle(episodeId, dto);
  }

  searchEpisodeSubtitles(episodeId: string, language: string): Promise<SubtitleCandidateDto[]> {
    return this.shows.searchEpisodeSubtitles(episodeId, language);
  }

  searchEpisodeSubtitlesByHash(
    episodeId: string,
    language: string,
  ): Promise<SubtitleCandidateDto[]> {
    return this.shows.searchEpisodeSubtitlesByHash(episodeId, language);
  }

  importEpisodeSubtitle(episodeId: string, fileId: string, language: string): Promise<void> {
    return this.shows.importEpisodeSubtitle(episodeId, fileId, language);
  }

  uploadEpisodeSubtitle(
    episodeId: string,
    language: string,
    format: string,
    content: string,
  ): Promise<void> {
    return this.shows.uploadEpisodeSubtitle(episodeId, language, format, content);
  }
}

/**
 * The home hero/banner carousel, combined across movies and shows into one admin-orderable list
 * - kept as its own use case (rather than living on AdminMoviesUseCases as it used to, movie-
 * only) since it genuinely spans both repositories and doesn't belong more to one than the other.
 */
@Injectable()
export class AdminFeaturedUseCases {
  constructor(
    private readonly movies: AdminMoviesRepository,
    private readonly shows: AdminShowsRepository,
  ) {}

  async list(): Promise<AdminFeaturedItemDto[]> {
    const [movies, shows] = await Promise.all([
      this.movies.listFeatured(),
      this.shows.listFeatured(),
    ]);
    // featuredOrder on each summary is the *global* position across both tables (assigned by
    // setFeatured below) - sorting the tagged, combined list by it reconstructs the one true
    // interleaved sequence the admin last saved, not just "movies first, then shows".
    return [
      ...movies.map((movie): AdminFeaturedItemDto => ({ ...movie, type: 'movie' })),
      ...shows.map((show): AdminFeaturedItemDto => ({ ...show, type: 'show' })),
    ].sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0));
  }

  async setFeatured(items: FeaturedItemInputDto[]): Promise<void> {
    const movieEntries = items
      .map((item, order) => ({ ...item, order }))
      .filter((item) => item.type === 'movie')
      .map(({ id, order }) => ({ id, order }));
    const showEntries = items
      .map((item, order) => ({ ...item, order }))
      .filter((item) => item.type === 'show')
      .map(({ id, order }) => ({ id, order }));
    await Promise.all([this.movies.setFeatured(movieEntries), this.shows.setFeatured(showEntries)]);
  }
}

@Injectable()
export class DashboardUseCases {
  constructor(private readonly stats: DashboardStatsRepository) {}

  getStatistics(): Promise<DashboardStatisticsDto> {
    return this.stats.getStatistics();
  }
}

@Injectable()
export class ProvidersUseCases implements OnModuleInit {
  constructor(
    private readonly runtime: ProvidersRuntime,
    private readonly registryRepository: ProviderRegistryRepository,
    private readonly metrics: ProviderMetricsTracker,
  ) {}

  /** Seeds a `Provider` row for every registered provider so admin actions have something to update. */
  async onModuleInit(): Promise<void> {
    for (const provider of this.runtime.registry.list()) {
      await this.registryRepository.syncDefaults(
        provider.metadata.id,
        provider.metadata.name,
        null,
        provider.metadata.priority,
      );
    }
  }

  async list(): Promise<ProviderSummaryDto[]> {
    return Promise.all(
      this.runtime.registry.list().map(async (provider) => {
        const row = await this.registryRepository.findBySlug(provider.metadata.id);
        return {
          id: provider.metadata.id,
          name: provider.metadata.name,
          priority: row?.priority ?? provider.metadata.priority,
          capabilities: [...provider.metadata.capabilities],
          isEnabled: row?.isEnabled ?? true,
          lastSyncAt: row?.lastSyncAt ? row.lastSyncAt.toISOString() : null,
          successRate: this.metrics.successRate(provider.metadata.id),
        };
      }),
    );
  }

  async health(): Promise<ProviderHealthSummaryDto[]> {
    const snapshots = await this.runtime.lifecycleManager.initialize();
    await Promise.all(
      snapshots.map((snapshot) =>
        this.registryRepository.touchLastSync(snapshot.providerId).catch(() => undefined),
      ),
    );
    return snapshots.map((snapshot) => ({
      providerId: snapshot.providerId,
      status: snapshot.status,
      latencyMs: snapshot.latencyMs,
      lastCheckedAt: snapshot.lastCheckedAt.toISOString(),
    }));
  }

  async triggerDiscovery(providerId: string): Promise<{ discovered: number }> {
    const provider = this.assertRegistered(providerId);
    const result = await this.runtime.discoveryEngine.run(provider, DiscoveryModeEnum.MANUAL);
    if (!isOk(result)) {
      throw new NotFoundException(result.error.message);
    }
    return { discovered: result.value.items.length };
  }

  async setEnabled(providerId: string, isEnabled: boolean): Promise<void> {
    this.assertRegistered(providerId);
    await this.registryRepository.setEnabled(providerId, isEnabled);
  }

  async setPriority(providerId: string, priority: number): Promise<void> {
    this.assertRegistered(providerId);
    await this.registryRepository.setPriority(providerId, priority);
  }

  /** Re-runs a single provider's health check on demand ("Reload"/"Health Check" in the admin panel). */
  async reload(providerId: string): Promise<ProviderHealthSummaryDto> {
    this.assertRegistered(providerId);
    const snapshot = await this.runtime.lifecycleManager.refresh(providerId);
    await this.registryRepository.touchLastSync(providerId);
    return {
      providerId: snapshot.providerId,
      status: snapshot.status,
      latencyMs: snapshot.latencyMs,
      lastCheckedAt: snapshot.lastCheckedAt.toISOString(),
    };
  }

  private assertRegistered(providerId: string) {
    const provider = this.runtime.registry.tryResolve(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider "${providerId}" is not registered.`);
    }
    return provider;
  }
}

// "Smart import": search TMDB's own /discover endpoint by criteria (rating, year, genre,
// original language) and import whichever results the admin actually picks - see
// TmdbDiscoverService's own comment for why this is a thin wrapper around that endpoint rather
// than a separate recommendation system. discover() itself never imports anything (each
// candidate's `alreadyImported` flag is what lets the admin skip ones already in the catalog -
// the actual duplicate-prevention mechanism); import() only ever runs for tmdbIds the admin
// explicitly selected afterward.
@Injectable()
export class AdminDiscoverUseCases {
  constructor(
    private readonly discoverService: TmdbDiscoverService,
    private readonly tmdbImport: TmdbImportService,
    private readonly archiveOrg: ArchiveOrgService,
    private readonly movies: AdminMoviesRepository,
  ) {}

  discover(query: DiscoverQueryDto): Promise<DiscoverCandidateDto[]> {
    return this.discoverService.discover({
      type: query.type,
      sortBy: query.sortBy ?? 'vote_average.desc',
      year: query.year,
      genre: query.genre,
      originalLanguage: query.originalLanguage,
      minVoteCount: query.minVoteCount,
      limit: query.limit ?? 10,
      page: query.page ?? 1,
    });
  }

  async import(dto: DiscoverImportDto): Promise<DiscoverImportResultDto[]> {
    const results: DiscoverImportResultDto[] = [];
    for (const tmdbId of dto.tmdbIds) {
      try {
        const id =
          dto.type === 'movie'
            ? await this.tmdbImport.importMovie(tmdbId)
            : await this.tmdbImport.importShow(tmdbId);
        results.push({ tmdbId, success: true, id });
      } catch (err) {
        results.push({
          tmdbId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  /**
   * Same "search first, act second" shape as discover() above, but sourced from Internet
   * Archive's public-domain feature_films collection instead of TMDB's own /discover filters -
   * see ArchiveOrgService's own comment for why this exists at all (a legally-clean way to expand
   * the catalog with titles that genuinely aren't under copyright, rather than a fallback stream
   * source for titles already in it - Internet Archive essentially never has a usable copy of a
   * modern film already in this catalog, only fan content about it).
   *
   * Bounded to a modest page size (10) since, unlike discover() above, every single candidate
   * needs *two* extra round trips just to render the list - one to Internet Archive's own
   * /metadata endpoint (license + real video files, not available from search results alone) and
   * one to TMDB's /search endpoint (real poster/title-match, plus alreadyImported) - a much larger
   * page would make one search noticeably slow for little practical benefit.
   */
  async discoverArchive(
    query: string,
    start = 0,
    sortBy: ArchiveSortBy = 'downloads',
    genre?: string,
    language?: string,
  ): Promise<ArchiveDiscoverCandidateDto[]> {
    const results = await this.archiveOrg.search(query, {
      start,
      rows: 10,
      sortBy,
      genre,
      language,
    });
    const candidates: ArchiveDiscoverCandidateDto[] = [];
    for (const r of results) {
      const [item, matched] = await Promise.all([
        this.archiveOrg.getItem(r.identifier).catch(() => null),
        this.discoverService.searchByTitle('movie', r.title, r.year ?? undefined),
      ]);
      candidates.push({
        identifier: r.identifier,
        title: r.title,
        year: r.year,
        thumbnailUrl: `https://archive.org/services/img/${r.identifier}`,
        isRecognizedOpenLicense: item?.isRecognizedOpenLicense ?? false,
        hasPlayableFile: (item?.videoFiles.length ?? 0) > 0,
        matchedTmdbId: matched?.tmdbId ?? null,
        matchedPoster: matched?.poster ?? null,
        alreadyImported: matched?.alreadyImported ?? false,
      });
    }
    return candidates;
  }

  /**
   * Imports a batch of Internet Archive identifiers the admin picked from discoverArchive above -
   * for each one: refuses it outright without a recognized open license or a TMDB match (no
   * license means it isn't actually legal to publish; no TMDB match means there's no real
   * metadata to import it with), otherwise imports/refreshes the matched TMDB title (importMovie
   * upserts on tmdbId, so this is a no-op if it's already in the catalog) and attaches the
   * largest available Internet Archive video file to it as a real Stream.
   */
  async importArchive(identifiers: string[]): Promise<ArchiveImportResultDto[]> {
    const results: ArchiveImportResultDto[] = [];
    for (const identifier of identifiers) {
      try {
        const item = await this.archiveOrg.getItem(identifier);
        if (!item.isRecognizedOpenLicense) {
          throw new Error(
            `"${item.title}" has no recognized public-domain/Creative Commons license (licenseurl: ${item.licenseUrl ?? 'none'}).`,
          );
        }
        const bestFile = item.videoFiles[0];
        if (!bestFile)
          throw new Error(`"${item.title}" has no playable .mp4 file on Internet Archive.`);
        const matched = await this.discoverService.searchByTitle(
          'movie',
          item.title,
          item.year ?? undefined,
        );
        if (!matched) throw new Error(`No TMDB match found for "${item.title}".`);
        const movieId = await this.tmdbImport.importMovie(matched.tmdbId);
        await this.movies.importArchiveOrgStream(movieId, identifier, bestFile.name);
        results.push({ identifier, success: true, id: movieId });
      } catch (err) {
        results.push({
          identifier,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }
}
