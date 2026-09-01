import { apiRequest, apiRequestWithMeta } from '../lib/apiClient';
import type {
  AdminFeaturedItemDto,
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
  SyncIssueDto,
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
      params: { q: query, start, sortBy, genre: genre || undefined, language: language || undefined },
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

  listSyncIssues(resolved: boolean): Promise<SyncIssueDto[]> {
    return apiRequest<SyncIssueDto[]>('admin/sync-issues', { params: { resolved } });
  },

  resolveSyncIssue(id: string, resolved: boolean): Promise<void> {
    return apiRequest<void>(`admin/sync-issues/${id}/resolve`, {
      method: 'POST',
      params: { resolved },
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
