import type { MediaCategory } from '@ctv-platform/domain';

/**
 * External DTOs returned by providers. Core/Infrastructure map these into
 * domain aggregates; external shapes never enter the database directly.
 */
export interface ProviderArtworkDto {
  readonly poster?: string;
  readonly backdrop?: string;
  readonly logo?: string;
  readonly thumbnail?: string;
  readonly still?: string;
}

export interface ProviderStreamDto {
  readonly providerStreamId: string;
  readonly quality: string;
  readonly serverName: string;
  readonly playbackUrl: string;
  readonly codec?: string;
  readonly language?: string;
  readonly hdr?: boolean;
  readonly audio?: string;
}

export interface ProviderSubtitleDto {
  readonly language: string;
  readonly format: string;
  readonly downloadUrl: string;
  readonly isDefault: boolean;
  readonly providerName: string;
}

export interface ProviderMovieDto {
  readonly providerMovieId: string;
  readonly title: string;
  readonly originalTitle?: string;
  readonly overview?: string;
  readonly releaseDate?: string;
  readonly isAvailable: boolean;
  readonly artwork: ProviderArtworkDto;
  readonly streams: readonly ProviderStreamDto[];
  readonly subtitles: readonly ProviderSubtitleDto[];
  readonly raw?: Readonly<Record<string, unknown>>;
}

export interface ProviderEpisodeDto {
  readonly providerEpisodeId: string;
  readonly seasonNumber: number;
  readonly episodeNumber: number;
  readonly title: string;
  readonly overview?: string;
  readonly isAvailable: boolean;
  readonly streams: readonly ProviderStreamDto[];
  readonly subtitles: readonly ProviderSubtitleDto[];
}

export interface ProviderSeasonDto {
  readonly providerSeasonId: string;
  readonly seasonNumber: number;
  readonly title?: string;
  readonly episodes: readonly ProviderEpisodeDto[];
}

export interface ProviderShowDto {
  readonly providerShowId: string;
  readonly title: string;
  readonly originalTitle?: string;
  readonly overview?: string;
  readonly isAvailable: boolean;
  readonly artwork: ProviderArtworkDto;
  readonly seasons: readonly ProviderSeasonDto[];
}

export interface ProviderCatalogItemDto {
  readonly providerContentId: string;
  readonly kind: Exclude<MediaCategory, 'episode'>;
  readonly title: string;
  readonly artwork: ProviderArtworkDto;
}

export interface ProviderSearchResultDto {
  readonly items: readonly ProviderCatalogItemDto[];
  readonly totalCount: number;
}
