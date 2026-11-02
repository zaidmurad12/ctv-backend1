// Thin fetch wrapper around cee.buzz's and cinemana.shabakaty.com's shared, undocumented Android
// API shape (same endpoint names/response fields on both - only the base URL differs). Mirrors
// CinemanaTVRN/src/providers/cee.ts and cinemana.ts field-for-field, but adds one thing neither
// of those client-side files use: calling AdvancedSearch with an EMPTY videoTitle returns a full
// paginated browse of the source's entire catalog instead of a search result - verified live
// (~832 pages of 12 items each, both movies and series, on both cee.buzz and cinemana.shabakaty.com).
// That's what makes ScheduledImportService's discovery sweep possible without ever needing an
// actual "list newest"/"browse all" endpoint, which this API has never been found to expose.
//
// Deliberately NOT a ProviderInterface/packages/provider-* implementation - that abstraction
// (services/importer, packages/sdk's DiscoveryEngine) is unused scaffolding elsewhere in this
// repo, and this only needs 4 plain calls. Kept as flat and pragmatic as
// cinemanaBackfillService.ts's own inline approach.

export interface SourceCatalogEntry {
  nb?: string | number;
  en_title?: string;
  ar_title?: string;
  year?: string | number;
  stars?: string | number;
  kind?: string | number; // "1" movie / "2" series
  imdbUrlRef?: string;
  imgObjUrl?: string;
  imgThumbObjUrl?: string;
  season?: string | number;
  episodeNummer?: string | number;
  rootSeries?: string | number;
  translations?: Array<{ name?: string; file?: string; url?: string }>;
}

export interface SourceStreamVariant {
  resolution?: string;
  videoUrl?: string;
  url?: string;
  name?: string;
}

function asArray<T>(value: T[] | { data?: T[] } | null | undefined): T[] {
  return Array.isArray(value) ? value : (value?.data ?? []);
}

export class SourceCatalogClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
  ) {}

  browse(type: 'movie' | 'series', page: number): Promise<SourceCatalogEntry[]> {
    return this.getArray<SourceCatalogEntry>(`/AdvancedSearch?videoTitle=&type=${type}&page=${page}`);
  }

  // Same AdvancedSearch endpoint as browse() above, but with a real query - for finding this
  // source's copy of a title we already have (subtitle backfill, dead-link healing), as opposed
  // to browse()'s empty-query full-catalog walk used for fresh discovery.
  search(type: 'movie' | 'series', query: string): Promise<SourceCatalogEntry[]> {
    return this.getArray<SourceCatalogEntry>(`/AdvancedSearch?videoTitle=${encodeURIComponent(query)}&type=${type}`);
  }

  info(nb: string): Promise<SourceCatalogEntry> {
    return this.getOne<SourceCatalogEntry>(`/allVideoInfo/id/${encodeURIComponent(nb)}`);
  }

  streams(nb: string): Promise<SourceStreamVariant[]> {
    return this.getArray<SourceStreamVariant>(`/transcoddedFiles/id/${encodeURIComponent(nb)}`);
  }

  episodes(nb: string): Promise<SourceCatalogEntry[]> {
    return this.getArray<SourceCatalogEntry>(`/videoSeason/id/${encodeURIComponent(nb)}`);
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Source API error ${response.status} for ${path}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getArray<T>(path: string): Promise<T[]> {
    const value = await this.request<T[] | { data?: T[] }>(path);
    return asArray(value);
  }

  private async getOne<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }
}
