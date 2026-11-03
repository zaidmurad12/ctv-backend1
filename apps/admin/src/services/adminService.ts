import { apiRequest, apiRequestWithMeta } from '../lib/apiClient';
import type { CheckTitle } from '../lib/sourceMatch';
import type {
  AdminFeaturedItemDto,
  HomeSectionDto,
  HomeSectionImportSpec,
  HomeSectionItemDto,
  HomeSectionKind,
  HomeSectionListPreview,
  RulePreviewItem,
  HomeSectionRule,
  HomeSectionAiPlan,
  ArchiveDiscoverCandidateDto,
  ArchiveImportResultDto,
  AdminMovieDetailDto,
  AdminMovieFilterOptions,
  AdminMovieListParams,
  AdminMovieSummaryDto,
  AdminShowDetailDto,
  AdminShowFilterOptions,
  AdminShowListParams,
  AdminShowSummaryDto,
  CreateStreamPatch,
  CreateSubtitlePatch,
  DashboardStatisticsDto,
  DiscoverCandidateDto,
  DiscoverImportResultDto,
  DiscoverParams,
  FeaturedItemInput,
  PaginationMeta,
  ProviderHealthSummaryDto,
  ProviderSummaryDto,
  SubtitleCandidateDto,
  UpdateMoviePatch,
  UpdateShowPatch,
  UpdateStreamPatch,
  UpdateSubtitlePatch,
  UserResponseDto,
} from '../lib/types';

export interface PagedResult<T> {
  readonly items: T[];
  readonly meta: PaginationMeta;
}

export type JobName = 'newest' | 'episodes';

export interface JobsOverview {
  configured: boolean;
  database: { sizeMb: number | null; limitMb: number };
  runs: Array<{
    id: number;
    title: string;
    status: string;
    conclusion: string | null;
    startedAt: string;
    updatedAt: string;
    url: string;
    trigger: 'schedule' | 'manual';
  }>;
}

export interface TvSyncLog {
  stats: { matched24h: number; imported24h: number; unmatched24h: number; total: number };
  items: Array<{
    nb: string;
    kind: 'movie' | 'show';
    enTitle: string | null;
    arTitle: string | null;
    year: number | null;
    imdbId: string | null;
    status: string;
    method: string | null;
    at: string;
    target: { id: string; title: string; titleAr: string | null; status: string } | null;
  }>;
}

export const adminService = {
  getStatistics(): Promise<DashboardStatisticsDto> {
    return apiRequest<DashboardStatisticsDto>('admin/dashboard/statistics');
  },

  async listUsers(page = 1, limit = 20): Promise<PagedResult<UserResponseDto>> {
    return apiRequestWithMeta<UserResponseDto[]>('admin/users', { params: { page, limit } });
  },

  updateUser(id: string, patch: { role?: string; isActive?: boolean }): Promise<UserResponseDto> {
    return apiRequest<UserResponseDto>(`admin/users/${id}`, { method: 'PATCH', body: patch });
  },

  listProviders(): Promise<ProviderSummaryDto[]> {
    return apiRequest<ProviderSummaryDto[]>('admin/providers');
  },

  checkProvidersHealth(): Promise<ProviderHealthSummaryDto[]> {
    return apiRequest<ProviderHealthSummaryDto[]>('admin/providers/health');
  },

  reloadProvider(id: string): Promise<ProviderHealthSummaryDto> {
    return apiRequest<ProviderHealthSummaryDto>(`admin/providers/${id}/reload`, { method: 'POST' });
  },

  triggerDiscovery(id: string): Promise<{ discovered: number }> {
    return apiRequest<{ discovered: number }>(`admin/providers/${id}/discover`, { method: 'POST' });
  },

  setProviderEnabled(id: string, enabled: boolean): Promise<void> {
    return apiRequest<void>(`admin/providers/${id}/${enabled ? 'enable' : 'disable'}`, {
      method: 'POST',
    });
  },

  setProviderPriority(id: string, priority: number): Promise<void> {
    return apiRequest<void>(`admin/providers/${id}/priority`, {
      method: 'PATCH',
      body: { priority },
    });
  },

  async listMovies(params: AdminMovieListParams): Promise<PagedResult<AdminMovieSummaryDto>> {
    return apiRequestWithMeta<AdminMovieSummaryDto[]>('admin/movies', {
      params: { page: 1, limit: 20, ...params },
    });
  },

  listMovieFilterOptions(): Promise<AdminMovieFilterOptions> {
    return apiRequest<AdminMovieFilterOptions>('admin/movies/filters');
  },

  importMovie(tmdbId: string): Promise<{ id: string }> {
    return apiRequest<{ id: string }>('admin/movies/import', { method: 'POST', body: { tmdbId } });
  },

  reimportMovie(id: string): Promise<{ id: string }> {
    return apiRequest<{ id: string }>(`admin/movies/${id}/reimport`, { method: 'POST' });
  },

  deleteMovie(id: string): Promise<void> {
    return apiRequest<void>(`admin/movies/${id}`, { method: 'DELETE' });
  },

  listFeatured(): Promise<AdminFeaturedItemDto[]> {
    return apiRequest<AdminFeaturedItemDto[]>('admin/featured');
  },

  setFeatured(items: FeaturedItemInput[]): Promise<void> {
    return apiRequest<void>('admin/featured', { method: 'PUT', body: { items } });
  },

  getMovie(id: string): Promise<AdminMovieDetailDto> {
    return apiRequest<AdminMovieDetailDto>(`admin/movies/${id}`);
  },

  updateMovie(id: string, patch: UpdateMoviePatch): Promise<void> {
    return apiRequest<void>(`admin/movies/${id}`, { method: 'PATCH', body: patch });
  },

  addStream(movieId: string, patch: CreateStreamPatch): Promise<void> {
    return apiRequest<void>(`admin/movies/${movieId}/streams`, { method: 'POST', body: patch });
  },

  updateStream(streamId: string, patch: UpdateStreamPatch): Promise<void> {
    return apiRequest<void>(`admin/streams/${streamId}`, { method: 'PATCH', body: patch });
  },

  deleteStream(streamId: string): Promise<void> {
    return apiRequest<void>(`admin/streams/${streamId}`, { method: 'DELETE' });
  },

  addSubtitle(movieId: string, patch: CreateSubtitlePatch): Promise<void> {
    return apiRequest<void>(`admin/movies/${movieId}/subtitles`, { method: 'POST', body: patch });
  },

  updateSubtitle(subtitleId: string, patch: UpdateSubtitlePatch): Promise<void> {
    return apiRequest<void>(`admin/subtitles/${subtitleId}`, { method: 'PATCH', body: patch });
  },

  deleteSubtitle(subtitleId: string): Promise<void> {
    return apiRequest<void>(`admin/subtitles/${subtitleId}`, { method: 'DELETE' });
  },

  searchSubtitles(movieId: string, language: string): Promise<SubtitleCandidateDto[]> {
    return apiRequest<SubtitleCandidateDto[]>(`admin/movies/${movieId}/subtitle-search`, {
      params: { language },
    });
  },

  searchSubtitlesByHash(movieId: string, language: string): Promise<SubtitleCandidateDto[]> {
    return apiRequest<SubtitleCandidateDto[]>(`admin/movies/${movieId}/subtitle-search-by-hash`, {
      params: { language },
    });
  },

  importSubtitleFromSearch(movieId: string, fileId: string, language: string): Promise<void> {
    return apiRequest<void>(`admin/movies/${movieId}/subtitles/import`, {
      method: 'POST',
      body: { fileId, language },
    });
  },

  discoverArchive(
    query: string,
    start = 0,
    sortBy: 'downloads' | 'addeddate' = 'downloads',
    genre?: string,
    language?: string,
  ): Promise<ArchiveDiscoverCandidateDto[]> {
    return apiRequest<ArchiveDiscoverCandidateDto[]>('admin/discover/archive', {
      params: {
        q: query,
        start,
        sortBy,
        genre: genre || undefined,
        language: language || undefined,
      },
    });
  },

  discoverImportArchive(identifiers: string[]): Promise<ArchiveImportResultDto[]> {
    return apiRequest<ArchiveImportResultDto[]>('admin/discover/archive/import', {
      method: 'POST',
      body: { identifiers },
    });
  },

  uploadSubtitle(
    movieId: string,
    language: string,
    format: string,
    content: string,
  ): Promise<void> {
    return apiRequest<void>(`admin/movies/${movieId}/subtitles/upload`, {
      method: 'POST',
      body: { language, format, content },
    });
  },

  async listShows(params: AdminShowListParams): Promise<PagedResult<AdminShowSummaryDto>> {
    return apiRequestWithMeta<AdminShowSummaryDto[]>('admin/shows', {
      params: { page: 1, limit: 20, ...params },
    });
  },

  listShowFilterOptions(): Promise<AdminShowFilterOptions> {
    return apiRequest<AdminShowFilterOptions>('admin/shows/filters');
  },

  importShow(tmdbId: string): Promise<{ id: string }> {
    return apiRequest<{ id: string }>('admin/shows/import', { method: 'POST', body: { tmdbId } });
  },

  reimportShow(id: string): Promise<{ id: string }> {
    return apiRequest<{ id: string }>(`admin/shows/${id}/reimport`, { method: 'POST' });
  },

  sourceCheckCandidates(
    scope: 'unchecked' | 'unmatched' | 'all',
    type: 'movie' | 'show',
    offset: number,
    limit: number,
  ): Promise<{ total: number; items: CheckTitle[] }> {
    return apiRequest('admin/source-check/candidates', { params: { scope, type, offset, limit } });
  },

  jobsOverview(): Promise<JobsOverview> {
    return apiRequest('admin/jobs');
  },

  runJob(job: JobName): Promise<{ started: true }> {
    return apiRequest('admin/jobs/run', { method: 'POST', body: { job } });
  },

  sourceCheckTvLog(limit = 200): Promise<TvSyncLog> {
    return apiRequest('admin/source-check/tv-log', { params: { limit } });
  },

  saveSourceCheckResults(
    results: Array<{ type: 'movie' | 'show'; id: string; match: boolean }>,
  ): Promise<{ matched: number; unmatched: number; published?: number }> {
    return apiRequest('admin/source-check/results', { method: 'POST', body: { results } });
  },

  refreshShowEpisodeImages(id: string): Promise<{
    updated: number;
    unchanged: number;
    missing: number;
    seasons: number;
    mode?: string;
  }> {
    return apiRequest(`admin/shows/${id}/refresh-episode-images`, { method: 'POST' });
  },

  homeSections(): Promise<HomeSectionDto[]> {
    return apiRequest<HomeSectionDto[]>('admin/home-sections');
  },

  homeSectionPresets(): Promise<Array<{ key: string; labelEn: string; media: string }>> {
    return apiRequest('admin/home-sections/presets');
  },

  previewTmdbList(listId: string): Promise<HomeSectionListPreview> {
    return apiRequest<HomeSectionListPreview>('admin/home-sections/tmdb-list', {
      params: { listId },
    });
  },

  previewHomeRule(rule: HomeSectionRule, limit = 20): Promise<RulePreviewItem[]> {
    return apiRequest<RulePreviewItem[]>('admin/home-sections/rule-preview', {
      method: 'POST',
      body: { rule, limit },
    });
  },

  planAiHomeSection(prompt: string): Promise<HomeSectionAiPlan> {
    return apiRequest<HomeSectionAiPlan>('admin/home-sections/ai-plan', {
      method: 'POST',
      body: { prompt },
    });
  },

  createHomeSection(body: {
    kind: HomeSectionKind;
    titleAr: string;
    titleEn: string;
    maxItems?: number;
    rule?: HomeSectionRule;
  }): Promise<HomeSectionDto> {
    return apiRequest<HomeSectionDto>('admin/home-sections', { method: 'POST', body });
  },

  updateHomeSection(
    id: string,
    body: { titleAr?: string; titleEn?: string; isVisible?: boolean; maxItems?: number },
  ): Promise<void> {
    return apiRequest<void>(`admin/home-sections/${id}`, { method: 'PATCH', body });
  },

  reorderHomeSections(ids: string[]): Promise<void> {
    return apiRequest<void>('admin/home-sections/order', { method: 'PUT', body: { ids } });
  },

  deleteHomeSection(id: string): Promise<void> {
    return apiRequest<void>(`admin/home-sections/${id}`, { method: 'DELETE' });
  },

  homeSectionItems(id: string): Promise<HomeSectionItemDto[]> {
    return apiRequest<HomeSectionItemDto[]>(`admin/home-sections/${id}/items`);
  },

  addHomeSectionItem(id: string, body: { movieId?: string; showId?: string }): Promise<void> {
    return apiRequest<void>(`admin/home-sections/${id}/items`, { method: 'POST', body });
  },

  removeHomeSectionItem(id: string, itemId: string): Promise<void> {
    return apiRequest<void>(`admin/home-sections/${id}/items/${itemId}`, { method: 'DELETE' });
  },

  importHomeSection(id: string, body: HomeSectionImportSpec): Promise<void> {
    return apiRequest<void>(`admin/home-sections/${id}/import`, { method: 'POST', body });
  },

  restructureShowSeasons(id: string, layout: number[], allowDelete: boolean): Promise<void> {
    return apiRequest<void>(`admin/shows/${id}/restructure-seasons`, {
      method: 'POST',
      body: { layout, allowDelete },
    });
  },

  deleteShow(id: string): Promise<void> {
    return apiRequest<void>(`admin/shows/${id}`, { method: 'DELETE' });
  },

  getShow(id: string): Promise<AdminShowDetailDto> {
    return apiRequest<AdminShowDetailDto>(`admin/shows/${id}`);
  },

  updateShow(id: string, patch: UpdateShowPatch): Promise<void> {
    return apiRequest<void>(`admin/shows/${id}`, { method: 'PATCH', body: patch });
  },

  addEpisodeStream(episodeId: string, patch: CreateStreamPatch): Promise<void> {
    return apiRequest<void>(`admin/episodes/${episodeId}/streams`, { method: 'POST', body: patch });
  },

  addEpisodeSubtitle(episodeId: string, patch: CreateSubtitlePatch): Promise<void> {
    return apiRequest<void>(`admin/episodes/${episodeId}/subtitles`, {
      method: 'POST',
      body: patch,
    });
  },

  searchEpisodeSubtitles(episodeId: string, language: string): Promise<SubtitleCandidateDto[]> {
    return apiRequest<SubtitleCandidateDto[]>(`admin/episodes/${episodeId}/subtitle-search`, {
      params: { language },
    });
  },

  searchEpisodeSubtitlesByHash(
    episodeId: string,
    language: string,
  ): Promise<SubtitleCandidateDto[]> {
    return apiRequest<SubtitleCandidateDto[]>(
      `admin/episodes/${episodeId}/subtitle-search-by-hash`,
      {
        params: { language },
      },
    );
  },

  importEpisodeSubtitleFromSearch(
    episodeId: string,
    fileId: string,
    language: string,
  ): Promise<void> {
    return apiRequest<void>(`admin/episodes/${episodeId}/subtitles/import`, {
      method: 'POST',
      body: { fileId, language },
    });
  },

  uploadEpisodeSubtitle(
    episodeId: string,
    language: string,
    format: string,
    content: string,
  ): Promise<void> {
    return apiRequest<void>(`admin/episodes/${episodeId}/subtitles/upload`, {
      method: 'POST',
      body: { language, format, content },
    });
  },

  discover(params: DiscoverParams): Promise<DiscoverCandidateDto[]> {
    return apiRequest<DiscoverCandidateDto[]>('admin/discover', { params: { ...params } });
  },

  discoverImport(type: 'movie' | 'show', tmdbIds: string[]): Promise<DiscoverImportResultDto[]> {
    return apiRequest<DiscoverImportResultDto[]>('admin/discover/import', {
      method: 'POST',
      body: { type, tmdbIds },
    });
  },
};
