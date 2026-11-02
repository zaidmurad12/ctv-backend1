import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TmdbCandidate } from './sourceTitleMatcher.js';

const execFileAsync = promisify(execFile);

// See TmdbImportService's own comment - REPO_ROOT lets prisma/tmdb-lookup.mjs be found the same
// way in local dev as in the Cloud Run runtime image.
const REPO_ROOT = process.env.REPO_ROOT || process.cwd();

// Read-only TMDB lookups (find-by-imdb primary match, title/year search fallback) for
// ScheduledImportService - reuses prisma/bootstrap-importer.mjs's tested tmdbGet() via the same
// one-shot child-process convention as TmdbImportService, rather than a second raw TMDB client.
@Injectable()
export class TmdbLookupService {
  async findByImdb(imdbId: string): Promise<{ movieResults: TmdbCandidate[]; tvResults: TmdbCandidate[] }> {
    const result = await this.run(['--mode=find-by-imdb', `--imdbId=${imdbId}`]);
    return {
      movieResults: (result.movie_results ?? []) as TmdbCandidate[],
      tvResults: (result.tv_results ?? []) as TmdbCandidate[],
    };
  }

  async search(type: 'movie' | 'show', query: string, year?: number): Promise<TmdbCandidate[]> {
    const args = ['--mode=search', `--type=${type}`, `--query=${query}`];
    if (year) args.push(`--year=${year}`);
    const result = await this.run(args);
    return (result.results ?? []) as TmdbCandidate[];
  }

  async discover(
    type: 'movie' | 'show',
    opts: { page: number; languages?: string; minVotes?: number; releasedAfter?: string },
  ): Promise<{ ids: string[]; totalPages: number }> {
    const args = ['--mode=discover', `--type=${type}`, `--page=${opts.page}`];
    if (opts.languages) args.push(`--languages=${opts.languages}`);
    if (opts.minVotes != null) args.push(`--minVotes=${opts.minVotes}`);
    if (opts.releasedAfter) args.push(`--releasedAfter=${opts.releasedAfter}`);
    const result = await this.run(args);
    const results = (result.results ?? []) as Array<{ id: number }>;
    return { ids: results.map((r) => String(r.id)), totalPages: Number(result.total_pages ?? 1) };
  }

  // One page (up to 20 items) of a whitelisted TMDB list-style endpoint - see tmdb-lookup.mjs's
  // `endpoint` mode. `mediaType` is per item since a user list can mix movies and shows.
  async fetchPage(
    path: string,
    params: Record<string, string | number>,
    defaultMediaType: 'movie' | 'tv',
  ): Promise<{
    items: Array<{
      tmdbId: string;
      mediaType: 'movie' | 'tv';
      originalTitle?: string;
      date?: string;
      hasPoster: boolean;
      hasOverview: boolean;
      popularity: number;
      voteCount: number;
    }>;
    totalPages: number;
  }> {
    const result = await this.run(['--mode=endpoint', `--path=${path}`, `--params=${JSON.stringify(params)}`]);
    const results = (result.results ?? []) as Array<{
      id: number;
      media_type?: string;
      original_title?: string;
      original_name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      overview?: string;
      popularity?: number;
      vote_count?: number;
    }>;
    return {
      items: results
        .filter((r) => !r.media_type || r.media_type === 'movie' || r.media_type === 'tv')
        .map((r) => ({
          tmdbId: String(r.id),
          mediaType: (r.media_type as 'movie' | 'tv' | undefined) ?? defaultMediaType,
          // Lets a caller spot TMDB's own duplicate entries before importing - see
          // ScheduledImportService.isDuplicateOfExisting.
          originalTitle: r.original_title ?? r.original_name,
          date: r.release_date || r.first_air_date || undefined,
          // Quality signals for callers that filter out junk entries (see
          // ScheduledImportService.passesNewestQualityBar).
          hasPoster: !!r.poster_path,
          hasOverview: !!r.overview?.trim(),
          popularity: Number(r.popularity ?? 0),
          voteCount: Number(r.vote_count ?? 0),
        })),
      totalPages: Number(result.total_pages ?? 1),
    };
  }

  // A TMDB user list, with enough per-item detail (title/year/poster) to show the admin what is in it
  // before anything gets imported.
  async previewList(
    listId: string,
    page: number,
  ): Promise<{
    name: string | null;
    description: string | null;
    itemCount: number | null;
    totalPages: number;
    items: Array<{ tmdbId: string; mediaType: 'movie' | 'tv'; title: string; year: number | null; poster: string | null }>;
  }> {
    const result = await this.run(['--mode=endpoint', `--path=/list/${listId}`, `--params=${JSON.stringify({ page, language: 'en-US' })}`]);
    const results = (result.results ?? []) as Array<{
      id: number;
      media_type?: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
    }>;
    return {
      name: (result.name as string | null) ?? null,
      description: (result.description as string | null) ?? null,
      itemCount: (result.item_count as number | null) ?? null,
      totalPages: Number(result.total_pages ?? 1),
      items: results
        .filter((r) => !r.media_type || r.media_type === 'movie' || r.media_type === 'tv')
        .map((r) => {
          const date = r.release_date || r.first_air_date || '';
          return {
            tmdbId: String(r.id),
            mediaType: (r.media_type as 'movie' | 'tv' | undefined) ?? 'movie',
            title: r.title || r.name || '',
            year: date ? Number(date.slice(0, 4)) || null : null,
            poster: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
          };
        }),
    };
  }

  private async run(args: string[]): Promise<Record<string, unknown>> {
    try {
      const { stdout } = await execFileAsync('node', ['prisma/tmdb-lookup.mjs', ...args], {
        cwd: REPO_ROOT,
        timeout: 60_000,
      });
      const lastLine = stdout.trim().split('\n').filter(Boolean).pop() ?? '{}';
      return JSON.parse(lastLine) as Record<string, unknown>;
    } catch (err) {
      throw new InternalServerErrorException(
        `TMDB lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
