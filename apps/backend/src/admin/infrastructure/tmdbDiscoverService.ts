import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';

const TMDB_API_BASE = 'https://api.themoviedb.org/3';

export interface DiscoverFilters {
  type: 'movie' | 'show';
  sortBy:
    'vote_average.desc' | 'popularity.desc' | 'primary_release_date.desc' | 'first_air_date.desc';
  year?: number;
  genre?: string;
  originalLanguage?: string;
  minVoteCount?: number;
  limit: number;
  // TMDB's own result page (20 per page there) - without this, the exact same filters always
  // returned the exact same page-1 results every time (a title's rating/popularity rank doesn't
  // shift moment to moment), which read as "searching again shows nothing new" once the visible
  // ones were already imported. The admin UI's own "load more" is what actually advances this.
  page?: number;
}

export interface DiscoverCandidate {
  tmdbId: string;
  title: string;
  overview: string;
  poster: string | null;
  releaseDate: string | null;
  rating: number;
  voteCount: number;
  alreadyImported: boolean;
}

// A plain, keyed REST wrapper around TMDB's own /discover endpoint - the "smart import" admin
// feature (e.g. "top 10 highest-rated movies from 2019", "top 10 Arabic movies", "top 10 action
// movies") is really just that endpoint's own sort_by/with_genres/primary_release_year/
// with_original_language filters, surfaced as admin-friendly options instead of raw TMDB query
// syntax. Never imports anything itself (see AdminMoviesUseCases/AdminShowsUseCases's own
// discoverImport, which reuses TmdbImportService for that) - this only ever returns candidates
// to choose from, the same "search first, act second" shape OpenSubtitlesService already uses.
@Injectable()
export class TmdbDiscoverService {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  private get apiKey(): string | null {
    return process.env.TMDB_API_KEY || null;
  }

  async discover(filters: DiscoverFilters): Promise<DiscoverCandidate[]> {
    const apiKey = this.apiKey;
    if (!apiKey) return [];

    // 100 (a reasonable floor for Hollywood-scale English content) silently hid almost the
    // entire Arabic-language catalog - confirmed directly against TMDB: "highest rated Arabic
    // movies" with vote_count>=100 returns only ~20 titles total (nearly all festival/arthouse
    // films with an international audience), while ordinary Egyptian/Gulf commercial cinema
    // routinely sits at single or low-double-digit vote counts on TMDB regardless of how popular
    // it actually is locally - reported as "Egyptian movies just don't show up" when searching
    // Arabic content. 10 is still enough to filter out placeholder/test entries with 0-1 votes.
    const params = new URLSearchParams({
      api_key: apiKey,
      sort_by: filters.sortBy,
      'vote_count.gte': String(filters.minVoteCount ?? 10),
      page: String(filters.page ?? 1),
    });
    if (filters.originalLanguage) params.set('with_original_language', filters.originalLanguage);
    if (filters.year) {
      params.set(
        filters.type === 'movie' ? 'primary_release_year' : 'first_air_date_year',
        String(filters.year),
      );
    }
    if (filters.genre) {
      const genreId = await this.resolveGenreId(filters.type, filters.genre);
      if (genreId) params.set('with_genres', String(genreId));
    }

    const endpoint = filters.type === 'movie' ? 'discover/movie' : 'discover/tv';
    const res = await fetch(`${TMDB_API_BASE}/${endpoint}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const rows = (json.results ?? []).slice(0, filters.limit);

    const tmdbIds = rows.map((r) => String(r.id));
    const existing =
      filters.type === 'movie'
        ? await this.prisma.movie.findMany({
            where: { tmdbId: { in: tmdbIds } },
            select: { tmdbId: true },
          })
        : await this.prisma.tVShow.findMany({
            where: { tmdbId: { in: tmdbIds } },
            select: { tmdbId: true },
          });
    const existingIds = new Set(existing.map((e) => e.tmdbId));

    return rows.map((r) => ({
      tmdbId: String(r.id),
      title: String(filters.type === 'movie' ? r.title : r.name),
      overview: String(r.overview ?? ''),
      poster: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
      releaseDate: (filters.type === 'movie' ? r.release_date : r.first_air_date) as string | null,
      rating: Number(r.vote_average ?? 0),
      voteCount: Number(r.vote_count ?? 0),
      alreadyImported: existingIds.has(String(r.id)),
    }));
  }

  // Title+year lookup (TMDB's /search endpoint, not /discover) - used to find real TMDB metadata
  // for a title found through a completely different source (see ArchiveOrgService/
  // AdminDiscoverUseCases.discoverArchive) rather than to browse by filters. Internet Archive's
  // own title/year fields are free text from whoever uploaded the item, so this is a best-effort
  // match (top result only) - a wrong or missing match just means that Internet Archive title
  // gets skipped at import time (see AdminDiscoverUseCases.importArchive) rather than publishing
  // it with no real metadata at all.
  async searchByTitle(
    type: 'movie' | 'show',
    title: string,
    year?: number,
  ): Promise<{ tmdbId: string; poster: string | null; alreadyImported: boolean } | null> {
    const apiKey = this.apiKey;
    if (!apiKey) return null;
    const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
    const params = new URLSearchParams({ api_key: apiKey, query: title });
    if (year) params.set(type === 'movie' ? 'year' : 'first_air_date_year', String(year));
    const res = await fetch(`${TMDB_API_BASE}/${endpoint}?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const top = json.results?.[0];
    if (!top) return null;
    const tmdbId = String(top.id);
    const existing =
      type === 'movie'
        ? await this.prisma.movie.findFirst({ where: { tmdbId }, select: { id: true } })
        : await this.prisma.tVShow.findFirst({ where: { tmdbId }, select: { id: true } });
    return {
      tmdbId,
      poster: top.poster_path ? `https://image.tmdb.org/t/p/w342${top.poster_path}` : null,
      alreadyImported: !!existing,
    };
  }

  private genreCache = new Map<string, Map<string, number>>();

  private async resolveGenreId(type: 'movie' | 'show', genreName: string): Promise<number | null> {
    const cacheKey = type;
    if (!this.genreCache.has(cacheKey)) {
      const apiKey = this.apiKey;
      if (!apiKey) return null;
      const endpoint = type === 'movie' ? 'genre/movie/list' : 'genre/tv/list';
      const res = await fetch(`${TMDB_API_BASE}/${endpoint}?api_key=${apiKey}&language=en-US`, {
        signal: AbortSignal.timeout(8000),
      });
      const map = new Map<string, number>();
      if (res.ok) {
        const json = (await res.json()) as { genres?: Array<{ id: number; name: string }> };
        for (const g of json.genres ?? []) map.set(g.name.toLowerCase(), g.id);
      }
      this.genreCache.set(cacheKey, map);
    }
    return this.genreCache.get(cacheKey)!.get(genreName.toLowerCase()) ?? null;
  }
}
