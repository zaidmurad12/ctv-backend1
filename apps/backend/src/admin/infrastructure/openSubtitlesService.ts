import { Injectable } from '@nestjs/common';

const OPENSUBTITLES_API_BASE = 'https://api.opensubtitles.com/api/v1';

export interface SubtitleCandidate {
  fileId: string;
  language: string;
  releaseName: string;
  downloadCount: number;
  rating: number;
}

interface OpenSubtitlesSearchAttributes {
  language: string;
  release?: string;
  download_count?: number;
  ratings?: number;
  fps?: number;
  files?: Array<{ file_id: number }>;
}

interface OpenSubtitlesSearchResult {
  data?: Array<{ attributes: OpenSubtitlesSearchAttributes }>;
}

// Official OpenSubtitles REST API - a licensed, keyed subtitle search/download service (see
// https://www.opensubtitles.com/en/consumers), not a piracy source. Ported from the old app's
// server.ts, which downloaded and re-hosted the resulting file - this version deliberately
// never does that (see the comment on Subtitle.externalFileId in schema.prisma): it only ever
// returns candidates to choose from, and resolves a fresh (short-lived) download link on
// demand, right when the app actually plays the title.
@Injectable()
export class OpenSubtitlesService {
  private get apiKey(): string | null {
    return process.env.OPENSUBTITLES_API_KEY || null;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async search(
    title: string,
    year: number | null,
    language: string,
    imdbId?: string | null,
  ): Promise<SubtitleCandidate[]> {
    if (!title) return [];
    const params = new URLSearchParams({ query: title, languages: language });
    if (year) params.set('year', String(year));
    if (imdbId) params.set('imdb_id', imdbId.replace(/^tt/i, ''));
    return this.runSearch(params);
  }

  /**
   * A title/imdb search only ever finds *a* subtitle for the movie in general - not necessarily
   * one whose own timing actually matches this specific file (reported as "auto-sync/manual sync
   * both fail," which audio-based drift correction can only patch, not truly fix, when the real
   * cause is a subtitle authored against a different release entirely). OpenSubtitles' own
   * `moviehash` is exactly the identifier it uses internally to mean "this exact file, byte for
   * byte" - matching against it turns up a subtitle already timed for this precise release, when
   * one exists, instead of guessing from title metadata alone.
   */
  async searchByHash(hash: string, language: string): Promise<SubtitleCandidate[]> {
    if (!hash) return [];
    const params = new URLSearchParams({ moviehash: hash, languages: language });
    return this.runSearch(params);
  }

  /**
   * Episode subtitles are indexed by the *show's* imdb id plus season/episode number, not a
   * free-text title search (which only ever turns up movie-level matches) - OpenSubtitles'
   * `parent_imdb_id`/`season_number`/`episode_number` params are the documented way to search
   * for one. Falls back to a plain title query when the show has no imdb id on record.
   */
  async searchEpisode(
    showTitle: string,
    showImdbId: string | null | undefined,
    seasonNumber: number,
    episodeNumber: number,
    language: string,
  ): Promise<SubtitleCandidate[]> {
    const params = new URLSearchParams({
      languages: language,
      season_number: String(seasonNumber),
      episode_number: String(episodeNumber),
    });
    if (showImdbId) {
      params.set('parent_imdb_id', showImdbId.replace(/^tt/i, ''));
    } else if (showTitle) {
      params.set('query', showTitle);
    } else {
      return [];
    }
    return this.runSearch(params);
  }

  private async runSearch(params: URLSearchParams): Promise<SubtitleCandidate[]> {
    const apiKey = this.apiKey;
    if (!apiKey) return [];
    params.set('order_by', 'download_count');
    params.set('order_direction', 'desc');

    const res = await fetch(`${OPENSUBTITLES_API_BASE}/subtitles?${params.toString()}`, {
      headers: { 'Api-Key': apiKey, 'User-Agent': 'CTV-Platform v1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as OpenSubtitlesSearchResult;
    // Same quality-aware re-ranking as the old pipeline: community rating first (the real
    // "is this in sync" signal), download count as a tiebreaker, a small bonus for a real fps.
    const pool = (json.data ?? []).slice(0, 15);
    return pool
      .map((item) => {
        const a = item.attributes;
        const fileId = a.files?.[0]?.file_id;
        return fileId
          ? {
              fileId: String(fileId),
              language: a.language,
              releaseName: a.release ?? 'Unknown release',
              downloadCount: a.download_count ?? 0,
              rating: a.ratings ?? 0,
              fpsBonus: (a.fps ?? 0) > 0 ? 1 : 0,
            }
          : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => {
        const score = (c: typeof a) => c.rating * 2 + Math.log10(c.downloadCount + 1) + c.fpsBonus;
        return score(b) - score(a);
      })
      .slice(0, 10)
      .map(({ fileId, language: lang, releaseName, downloadCount, rating }) => ({
        fileId,
        language: lang,
        releaseName,
        downloadCount,
        rating,
      }));
  }

  /** A fresh, short-lived download link for a specific file id - re-resolved on every call, never cached server-side. */
  async resolveDownloadLink(fileId: string): Promise<string | null> {
    const apiKey = this.apiKey;
    if (!apiKey) return null;

    const res = await fetch(`${OPENSUBTITLES_API_BASE}/download`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'CTV-Platform v1.0',
        Accept: 'application/json',
      },
      body: JSON.stringify({ file_id: Number(fileId) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { link?: string };
    return json.link ?? null;
  }
}
