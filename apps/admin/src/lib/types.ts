/**
 * Mirrors the DTO shapes returned by apps/backend (see its src/admin and src/auth
 * controllers/dto.ts). This app is a separate deployable talking to the backend over HTTP, so
 * these types are kept local rather than imported from the backend package - same convention
 * apps/web's own src/lib/types.ts uses.
 */

export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface UserResponseDto {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly role: UserRole;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface AuthResponseDto {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: UserResponseDto;
}

export interface DashboardStatisticsDto {
  readonly movies: number;
  readonly shows: number;
  readonly episodes: number;
  readonly users: number;
}

export interface ProviderSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  readonly capabilities: string[];
  readonly isEnabled: boolean;
  readonly lastSyncAt?: string | null;
  readonly successRate?: number | null;
}

export interface ProviderHealthSummaryDto {
  readonly providerId: string;
  readonly status: string;
  readonly latencyMs: number;
  readonly lastCheckedAt: string;
}

// The full set the backend's MovieStatusEnum actually has - a summary/detail row can come back
// as any of these, even though only three are offered as manual choices in the edit UI (see
// EditableMovieStatus) - PENDING/INACTIVE are system-managed states, not ones an admin picks.
export type MovieStatus = 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'REMOVED' | 'INACTIVE';
// REMOVED, not "ARCHIVED" - the schema's MovieStatusEnum has never actually had an ARCHIVED
// member; saving that value used to pass this type's old, wider `IsIn` fine and then fail at
// the database.
export type EditableMovieStatus = 'DRAFT' | 'PUBLISHED' | 'REMOVED';

export interface AdminMovieSummaryDto {
  readonly id: string;
  readonly title: string;
  readonly titleAr?: string | null;
  readonly status: MovieStatus;
  readonly originalLanguage?: string | null;
  readonly poster?: string | null;
  readonly backdrop?: string | null;
  readonly logo?: string | null;
  readonly rating?: number | null;
  readonly releaseDate?: string | null;
  readonly hasPlayableStream: boolean;
  readonly hasSubtitles: boolean;
  readonly hasSourceMatch?: boolean | null;
}

export interface AdminMovieFilterOptions {
  readonly genres: string[];
  readonly languages: string[];
}

export interface AdminMovieListParams {
  page?: number;
  limit?: number;
  search?: string;
  genre?: string;
  language?: string;
  sort?: string;
  hasStream?: boolean;
  hasSubtitle?: boolean;
  hasSourceMatch?: boolean;
  status?: string;
  missingArabicTitle?: boolean;
  missingArtwork?: boolean;
}

export interface AdminStreamDto {
  readonly id: string;
  readonly quality: string;
  readonly serverName?: string | null;
  readonly streamUrl: string;
  readonly language?: string | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

export interface AdminSubtitleDto {
  readonly id: string;
  readonly language: string;
  readonly format: string;
  readonly url: string;
  readonly isDefault: boolean;
  readonly syncAnalysisStatus: string;
  readonly defaultOffsetMs: number;
  readonly defaultSpeed: number;
}

export interface AdminMovieDetailDto extends AdminMovieSummaryDto {
  readonly sourceLinks?: AdminSourceLink[];
  readonly overview?: string | null;
  readonly streams: AdminStreamDto[];
  readonly subtitles: AdminSubtitleDto[];
}

export interface AdminSourceLink {
  source: 'cee' | 'cinemana';
  nb: string;
  kind: 'movie' | 'series';
}

export interface UpdateMoviePatch {
  sourceLinks?: AdminSourceLink[];
  hasSourceMatch?: boolean | null;
  title?: string;
  titleAr?: string;
  overview?: string;
  status?: EditableMovieStatus;
  poster?: string;
  backdrop?: string;
  logo?: string;
}

export interface CreateStreamPatch {
  quality: string;
  serverName?: string;
  streamUrl: string;
  language?: string;
  isDefault?: boolean;
}

export interface UpdateStreamPatch {
  quality?: string;
  serverName?: string;
  streamUrl?: string;
  language?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface SubtitleCandidateDto {
  readonly fileId: string;
  readonly language: string;
  readonly releaseName: string;
  readonly downloadCount: number;
  readonly rating: number;
}

export interface ArchiveDiscoverCandidateDto {
  readonly identifier: string;
  readonly title: string;
  readonly year: number | null;
  readonly thumbnailUrl: string | null;
  readonly isRecognizedOpenLicense: boolean;
  readonly hasPlayableFile: boolean;
  readonly matchedTmdbId: string | null;
  readonly matchedPoster: string | null;
  readonly alreadyImported: boolean;
}

export interface ArchiveImportResultDto {
  readonly identifier: string;
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface CreateSubtitlePatch {
  language: string;
  format?: string;
  url: string;
  isDefault?: boolean;
}

export interface UpdateSubtitlePatch {
  language?: string;
  format?: string;
  url?: string;
  isDefault?: boolean;
  defaultOffsetMs?: number;
  defaultSpeed?: number;
}

// --- TV shows: same admin shape as movies, plus per-episode streams/subtitles (a show itself
// never has playable streams - only its episodes do). ------------------------------------------

export interface AdminShowSummaryDto {
  readonly hasSourceMatch?: boolean | null;
  readonly id: string;
  readonly title: string;
  readonly titleAr?: string | null;
  readonly status: MovieStatus;
  readonly originalLanguage?: string | null;
  readonly poster?: string | null;
  readonly backdrop?: string | null;
  readonly logo?: string | null;
  readonly rating?: number | null;
  readonly releaseDate?: string | null;
  readonly numberOfSeasons: number;
  readonly numberOfEpisodes: number;
  readonly hasIncompleteEpisodes: boolean;
  readonly hasAnyPlayableStream: boolean;
}

export interface AdminShowFilterOptions {
  readonly genres: string[];
  readonly languages: string[];
}

export interface AdminShowListParams {
  page?: number;
  limit?: number;
  search?: string;
  genre?: string;
  language?: string;
  sort?: string;
  missingStream?: boolean;
  missingSubtitle?: boolean;
  hasAnyStream?: boolean;
  hasSourceMatch?: boolean;
  status?: string;
  missingArabicTitle?: boolean;
  missingArtwork?: boolean;
}

export interface AdminEpisodeSummaryDto {
  readonly id: string;
  readonly seasonNumber: number;
  readonly episodeNumber: number;
  readonly title: string;
  readonly stillImage?: string | null;
  readonly hasPlayableStream: boolean;
  readonly hasSubtitles: boolean;
  readonly airDate?: string | null;
  readonly streams: AdminStreamDto[];
  readonly subtitles: AdminSubtitleDto[];
}

export interface AdminSeasonSummaryDto {
  readonly id: string;
  readonly seasonNumber: number;
  readonly name?: string | null;
  readonly airDate?: string | null;
  readonly episodes: AdminEpisodeSummaryDto[];
}

export interface AdminShowDetailDto extends AdminShowSummaryDto {
  readonly sourceLinks?: AdminSourceLink[];
  readonly overview?: string | null;
  readonly seasons: AdminSeasonSummaryDto[];
}

// The home hero/banner selection can mix movies and shows in one admin-ordered sequence - `type`
// says which shape a given entry actually is.
export type AdminFeaturedItemDto =
  (AdminMovieSummaryDto & { type: 'movie' }) | (AdminShowSummaryDto & { type: 'show' });

export interface FeaturedItemInput {
  id: string;
  type: 'movie' | 'show';
}

export interface UpdateShowPatch {
  sourceLinks?: AdminSourceLink[];
  hasSourceMatch?: boolean | null;
  title?: string;
  titleAr?: string;
  overview?: string;
  status?: EditableMovieStatus;
  poster?: string;
  backdrop?: string;
  logo?: string;
}

// "Smart import" - see TmdbDiscoverService's own comment in the backend.
export interface DiscoverParams {
  type: 'movie' | 'show';
  sortBy?:
    'vote_average.desc' | 'popularity.desc' | 'primary_release_date.desc' | 'first_air_date.desc';
  year?: number;
  genre?: string;
  originalLanguage?: string;
  minVoteCount?: number;
  limit?: number;
  page?: number;
}

export interface DiscoverCandidateDto {
  readonly tmdbId: string;
  readonly title: string;
  readonly overview: string;
  readonly poster: string | null;
  readonly releaseDate: string | null;
  readonly rating: number;
  readonly voteCount: number;
  readonly alreadyImported: boolean;
}

export interface DiscoverImportResultDto {
  readonly tmdbId: string;
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export type HomeSectionKind = 'RECENT' | 'POPULAR' | 'TOP_RATED' | 'SERIES' | 'CUSTOM' | 'RULE';

export interface HomeSectionRule {
  media: 'movie' | 'series' | 'all';
  sort: 'newest' | 'rating' | 'popularity';
  language?: string;
  genre?: string;
  country?: string;
  person?: string;
  collection?: string;
  yearFrom?: number;
  yearTo?: number;
  minVotes?: number;
  minRating?: number;
}

export interface HomeSectionAiPlan {
  titleAr: string;
  titleEn: string;
  maxItems: number;
  rule: HomeSectionRule;
}

export interface RulePreviewItem {
  id: string;
  type: 'movie' | 'show';
  title: string;
  year: number | null;
  rating: number | null;
}

export interface HomeSectionDto {
  id: string;
  kind: HomeSectionKind;
  titleAr: string;
  titleEn: string;
  sortOrder: number;
  isVisible: boolean;
  maxItems: number;
  rule?: HomeSectionRule | null;
  importSource: string | null;
  importStatus: 'IMPORTING' | 'DONE' | 'FAILED' | null;
  importTotal: number;
  importDone: number;
  importError: string | null;
  itemCount: number;
}

export interface HomeSectionItemDto {
  itemId: string;
  type: 'movie' | 'show';
  id: string;
  title: string;
  year: number | null;
  rating: number | null;
  status: string | null;
}

export interface HomeSectionImportSpec {
  source: 'preset' | 'list' | 'discover' | 'imdb';
  imdbIds?: string[];
  preset?: string;
  listId?: string;
  kind?: 'movie' | 'tv';
  year?: number;
  language?: string;
  genres?: string;
  keywords?: string;
  minVotes?: number;
  minRating?: number;
  sortBy?: string;
  limit: number;
  importMissing?: boolean;
}

export interface HomeSectionListPreview {
  listId: string;
  name: string | null;
  description: string | null;
  total: number;
  items: Array<{
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    year: number | null;
    poster: string | null;
    inCatalog: boolean;
  }>;
}
