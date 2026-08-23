/**
 * Mirrors the DTO shapes returned by apps/backend (Milestone 5), per
 * specification/09-Backend-API.md.txt "Response Format". The admin app is a
 * separate deployable talking to the backend over HTTP, so these types are
 * kept local rather than imported from the backend package.
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

export interface Page<T> {
  readonly items: T[];
  readonly meta: PaginationMeta;
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

export interface ArtworkDto {
  readonly poster?: string;
  readonly backdrop?: string;
  readonly logo?: string;
  readonly thumbnail?: string;
  readonly still?: string;
}

export interface StreamResponseDto {
  readonly id: string;
  readonly quality: string;
  readonly codec?: string | null;
  readonly language?: string | null;
  readonly serverName: string;
  readonly streamUrl: string;
  readonly isDefault: boolean;
}

export interface SubtitleResponseDto {
  readonly id: string;
  readonly language: string;
  readonly format: string;
  readonly url: string;
  readonly isDefault: boolean;
}

export interface MovieSummaryDto {
  readonly id: string;
  readonly title: string;
  readonly overview?: string | null;
  readonly releaseDate?: string | null;
  readonly rating?: number | null;
  readonly runtime?: number | null;
  readonly status: string;
  readonly artwork: ArtworkDto;
}

export interface MovieDetailDto extends MovieSummaryDto {
  readonly originalTitle?: string | null;
  readonly tagline?: string | null;
  readonly streams: StreamResponseDto[];
  readonly subtitles: SubtitleResponseDto[];
}

export interface SeasonSummaryDto {
  readonly id: string;
  readonly seasonNumber: number;
  readonly name?: string | null;
  readonly episodeCount: number;
  readonly poster?: string | null;
}

export interface SeasonDetailDto extends SeasonSummaryDto {
  readonly overview?: string | null;
  readonly episodes: EpisodeSummaryDto[];
}

export interface ShowSummaryDto {
  readonly id: string;
  readonly title: string;
  readonly overview?: string | null;
  readonly releaseDate?: string | null;
  readonly rating?: number | null;
  readonly numberOfSeasons: number;
  readonly numberOfEpisodes: number;
  readonly status: string;
  readonly artwork: ArtworkDto;
}

export interface ShowDetailDto extends ShowSummaryDto {
  readonly originalTitle?: string | null;
  readonly seasons: SeasonSummaryDto[];
}

export interface EpisodeSummaryDto {
  readonly id: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly overview?: string | null;
  readonly runtime?: number | null;
  readonly stillImage?: string | null;
}

export interface EpisodeDetailDto extends EpisodeSummaryDto {
  readonly streams: StreamResponseDto[];
  readonly subtitles: SubtitleResponseDto[];
}

export interface SearchResultItemDto {
  readonly id: string;
  readonly type: 'movie' | 'show';
  readonly title: string;
  readonly poster?: string | null;
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

export interface HealthDto {
  readonly status: string;
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly database: boolean;
  readonly redis: boolean;
}

export interface ListParams {
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
  readonly search?: string;
  /** Allows structural assignment to apiClient's `QueryParams` (a URLSearchParams-shaped bag). */
  readonly [key: string]: string | number | boolean | undefined;
}

export interface CatalogListParams extends ListParams {
  readonly year?: number;
  readonly language?: string;
}
