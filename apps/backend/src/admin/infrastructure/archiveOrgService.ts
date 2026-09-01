import { BadRequestException, Injectable } from '@nestjs/common';

const IA_BASE = 'https://archive.org';

export interface ArchiveSearchResult {
  identifier: string;
  title: string;
  year: number | null;
  downloads: number | null;
  avgRating: number | null;
}

export interface ArchiveVideoFile {
  name: string;
  format: string | null;
  quality: string | null;
  sizeBytes: number | null;
  url: string;
}

export interface ArchiveItemDetail {
  identifier: string;
  title: string;
  year: number | null;
  description: string | null;
  director: string | null;
  runtime: string | null;
  // A recognized public-domain/Creative Commons licenseurl is the one machine-readable signal
  // Internet Archive itself exposes for "this is actually legal to stream" - collection
  // membership (e.g. feature_films) is not that guarantee on its own, since it's an open upload
  // collection and does contain items later found not to be genuinely PD (see importStream's own
  // comment on why this gates the import, not just informs it).
  licenseUrl: string | null;
  isRecognizedOpenLicense: boolean;
  videoFiles: ArchiveVideoFile[];
}

function qualityFromHeight(height: number | null): string | null {
  if (height == null) return null;
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  return '240p';
}

// "publicdomain" and the various creativecommons.org/licenses/* URLs are the only license
// families that make a title genuinely safe to stream directly to viewers - anything else on
// Internet Archive (fair-use clips, orphaned-but-still-copyrighted uploads, etc.) isn't.
function isRecognizedOpenLicense(licenseUrl: string | null): boolean {
  if (!licenseUrl) return false;
  return /publicdomain|creativecommons\.org\/licenses/i.test(licenseUrl);
}

// A thin, read-only wrapper around Internet Archive's public search/metadata APIs - no API key,
// no auth, both endpoints are anonymous and free. Mirrors TmdbDiscoverService's own "search first,
// act second" shape: this never imports anything itself, it only ever returns candidates for the
// admin to look at and pick from (see AdminMoviesRepository.importArchiveOrgStream for the actual
// import step, gated on isRecognizedOpenLicense above).
// "downloads" (most-fetched - the closest thing to "الأشهر"/most-famous this collection has) or
// "addeddate" (most recently uploaded *to Internet Archive* - deliberately not a "newest film"
// sort: this collection's own `year` field is free text entered by whoever uploaded each item,
// and sorting by it surfaced obvious garbage (year "9999", year 2026 on decades-old films) mixed
// in with modern copyrighted rips that don't belong in a public-domain collection at all - see
// isRecognizedOpenLicense's own comment on why those get refused at import regardless).
export type ArchiveSortBy = 'downloads' | 'addeddate';

export interface ArchiveSearchOptions {
  start?: number;
  rows?: number;
  sortBy?: ArchiveSortBy;
  // Free-text match against Internet Archive's own `subject` field (semicolon-separated tags
  // like "romance;comedy") - informal, not a real taxonomy, so this is best-effort the same way
  // TMDB's own genre names are.
  genre?: string;
  // Internet Archive's `language` field uses MARC three-letter codes ("eng", "fre"), not TMDB's
  // two-letter ISO ones - a different code space entirely, not reusable between the two.
  language?: string;
}

@Injectable()
export class ArchiveOrgService {
  async search(query: string, opts: ArchiveSearchOptions = {}): Promise<ArchiveSearchResult[]> {
    const { start = 0, rows = 10, sortBy = 'downloads', genre, language } = opts;
    const trimmed = query.trim();
    // Restricted to the feature_films collection (not all of mediatype:movies, which is mostly
    // home movies, TV news clips, and unrelated ephemera) - still an open upload collection, not
    // a legal guarantee on its own, hence isRecognizedOpenLicense being checked per-item in
    // getItem/importArchiveOrgStream regardless of what this search step returns.
    //
    // An empty query browses the whole collection instead of matching nothing - the admin often
    // has no specific title in mind ("what's actually available to import?"), and sorted by
    // downloads desc by default this surfaces the most-fetched, most-likely-worth-publishing
    // titles first rather than an arbitrary/empty result.
    const clauses = ['mediatype:(movies)', 'collection:(feature_films)'];
    if (trimmed) clauses.push(`title:(${trimmed})`);
    if (genre) clauses.push(`subject:(${genre})`);
    if (language) clauses.push(`language:(${language})`);
    const q = clauses.join(' AND ');
    const params = new URLSearchParams({ q, output: 'json', rows: String(rows), start: String(start) });
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'year');
    params.append('fl[]', 'downloads');
    params.append('fl[]', 'avg_rating');
    params.append('sort[]', sortBy === 'addeddate' ? 'addeddate desc' : 'downloads desc');
    const res = await fetch(`${IA_BASE}/advancedsearch.php?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new BadRequestException(`Internet Archive search failed: HTTP ${res.status}`);
    const json = (await res.json()) as { response?: { docs?: Array<Record<string, unknown>> } };
    const docs = json.response?.docs ?? [];
    return docs.map((d) => ({
      identifier: String(d.identifier),
      title: String(d.title ?? d.identifier),
      year: d.year ? Number(d.year) : null,
      downloads: d.downloads != null ? Number(d.downloads) : null,
      avgRating: d.avg_rating != null ? Number(d.avg_rating) : null,
    }));
  }

  async getItem(identifier: string): Promise<ArchiveItemDetail> {
    const res = await fetch(`${IA_BASE}/metadata/${encodeURIComponent(identifier)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new BadRequestException(`Internet Archive metadata failed: HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, any>;
    // Items do get taken down after the fact (a later rights claim, a moderation flag) even from
    // this same feature_films collection - is_dark is Internet Archive's own marker for "this
    // still has a metadata record but the content itself is no longer served."
    if (data.is_dark || !data.metadata) {
      throw new BadRequestException(
        'This Internet Archive item is no longer available (taken down or restricted).',
      );
    }
    const meta = data.metadata as Record<string, unknown>;
    const server: string | undefined = data.server ?? data.d1;
    const dir: string | undefined = data.dir;
    const files = Array.isArray(data.files) ? (data.files as Array<Record<string, unknown>>) : [];
    const licenseUrl = typeof meta.licenseurl === 'string' ? meta.licenseurl : null;

    const videoFiles: ArchiveVideoFile[] = files
      .filter((f) => typeof f.name === 'string' && /\.mp4$/i.test(f.name as string))
      .map((f) => {
        const height = f.height != null ? Number(f.height) : null;
        return {
          name: f.name as string,
          format: typeof f.format === 'string' ? f.format : null,
          quality: qualityFromHeight(height),
          sizeBytes: f.size != null ? Number(f.size) : null,
          url: server && dir ? `https://${server}${dir}/${encodeURIComponent(f.name as string)}` : '',
        };
      })
      .filter((f) => !!f.url)
      // Highest resolution/largest file first - that's the one worth defaulting to in the UI.
      .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));

    return {
      identifier,
      title: typeof meta.title === 'string' ? meta.title : identifier,
      year: meta.year ? Number(meta.year) : null,
      description: typeof meta.description === 'string' ? meta.description : null,
      director: typeof meta.director === 'string' ? meta.director : null,
      runtime: typeof meta.runtime === 'string' ? meta.runtime : null,
      licenseUrl,
      isRecognizedOpenLicense: isRecognizedOpenLicense(licenseUrl),
      videoFiles,
    };
  }
}
