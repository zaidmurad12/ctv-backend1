/**
 * Raw shapes returned by a self-hosted Consumet REST API instance's movies
 * routes (e.g. `/movies/{source}/...`). These mirror the public API contract
 * documented at docs.consumet.org — deliberately loose (most fields
 * optional) since third-party scraper output is inconsistent across
 * providers/pages; `mapper/consumetMapper.ts` is responsible for tolerating
 * missing fields.
 */

export interface ConsumetSearchResultItem {
  readonly id: string;
  readonly title: string;
  readonly image?: string;
  readonly type?: string;
  readonly releaseDate?: string;
}

export interface ConsumetSearchResponse {
  readonly currentPage?: number;
  readonly hasNextPage?: boolean;
  readonly totalPages?: number;
  readonly totalResults?: number;
  readonly results: readonly ConsumetSearchResultItem[];
}

export interface ConsumetEpisodeSummary {
  readonly id: string;
  readonly title?: string;
  readonly season?: number;
  readonly number?: number;
  readonly description?: string;
  readonly image?: string;
}

export interface ConsumetMediaInfoResponse {
  readonly id: string;
  readonly title: string;
  readonly image?: string;
  readonly cover?: string;
  readonly logo?: string;
  readonly description?: string;
  readonly type?: string;
  readonly releaseDate?: string;
  readonly duration?: string;
  readonly episodes?: readonly ConsumetEpisodeSummary[];
}

export interface ConsumetStreamSource {
  readonly url: string;
  readonly quality?: string;
  readonly isM3U8?: boolean;
  readonly isDASH?: boolean;
}

export interface ConsumetSubtitleTrack {
  readonly url: string;
  readonly lang?: string;
  readonly language?: string;
}

export interface ConsumetWatchResponse {
  readonly headers?: Readonly<Record<string, string>>;
  readonly sources: readonly ConsumetStreamSource[];
  readonly subtitles?: readonly ConsumetSubtitleTrack[];
}

export interface ConsumetServerEntry {
  readonly name: string;
  readonly url: string;
}
