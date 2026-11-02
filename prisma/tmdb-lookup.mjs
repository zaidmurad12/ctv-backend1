/**
 * Read-only TMDB lookups for the scheduled source-catalog importer - never writes to the DB
 * (that's import-one.mjs's job, via TmdbImportService). Reuses bootstrap-importer.mjs's own
 * tested tmdbGet() (API key, retry/backoff) rather than a second raw fetch.
 *
 * Usage:
 *   node prisma/tmdb-lookup.mjs --mode=find-by-imdb --imdbId=tt1234567
 *   node prisma/tmdb-lookup.mjs --mode=search --type=movie|show --query=<title> [--year=YYYY]
 * Prints one JSON object as the last line of stdout on success.
 */
import { tmdbGet } from './bootstrap-importer.mjs';

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const mode = arg('mode');

  if (mode === 'find-by-imdb') {
    const imdbId = arg('imdbId');
    if (!imdbId) throw new Error('Missing --imdbId=<tt...>');
    const result = await tmdbGet(`/find/${encodeURIComponent(imdbId)}`, { external_source: 'imdb_id' });
    console.log(JSON.stringify({ movie_results: result.movie_results ?? [], tv_results: result.tv_results ?? [] }));
    return;
  }

  if (mode === 'search') {
    const type = arg('type');
    const query = arg('query');
    const year = arg('year');
    if (type !== 'movie' && type !== 'show') throw new Error('Usage: --type=movie|show');
    if (!query) throw new Error('Missing --query=<title>');
    const params = { query };
    if (year) params.year = year;
    const result = await tmdbGet(type === 'show' ? '/search/tv' : '/search/movie', params);
    console.log(JSON.stringify({ results: result.results ?? [] }));
    return;
  }

  // Popularity-sorted browse for the TMDB-first import (no CEE/Cinemana involved). --languages
  // takes TMDB's own OR syntax ("fr|es|ko"); --minVotes filters out zero-vote noise;
  // --releasedAfter (YYYY-MM-DD) narrows to recent releases for the "latest" pass.
  if (mode === 'discover') {
    const type = arg('type');
    if (type !== 'movie' && type !== 'show') throw new Error('Usage: --type=movie|show');
    const params = {
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page: arg('page') ?? '1',
      language: 'en-US',
    };
    const languages = arg('languages');
    if (languages) params.with_original_language = languages;
    const minVotes = arg('minVotes');
    if (minVotes) params['vote_count.gte'] = minVotes;
    const releasedAfter = arg('releasedAfter');
    if (releasedAfter) params[type === 'show' ? 'first_air_date.gte' : 'primary_release_date.gte'] = releasedAfter;
    const result = await tmdbGet(type === 'show' ? '/discover/tv' : '/discover/movie', params);
    console.log(JSON.stringify({ results: result.results ?? [], total_pages: result.total_pages ?? 1 }));
    return;
  }

  // Generic read-only page fetch for admin-built home rows (presets, TMDB user lists, discover
  // queries) - the path is whitelisted here AND in TmdbLookupService, never a free-form URL.
  if (mode === 'endpoint') {
    const endpointPath = arg('path');
    if (!endpointPath || !/^\/(movie\/(top_rated|popular|now_playing|upcoming)|tv\/(top_rated|popular|on_the_air|airing_today)|trending\/(movie|tv)\/(day|week)|discover\/(movie|tv)|list\/\d+)$/.test(endpointPath)) {
      throw new Error('Unsupported --path');
    }
    const params = JSON.parse(arg('params') ?? '{}');
    const result = await tmdbGet(endpointPath, params);
    console.log(
      JSON.stringify({
        results: result.results ?? result.items ?? [],
        total_pages: result.total_pages ?? 1,
        // Only a /list/<id> response has these - used for the admin's paste-a-link preview.
        name: result.name ?? null,
        description: result.description ?? null,
        item_count: result.item_count ?? null,
      }),
    );
    return;
  }

  throw new Error('Usage: --mode=find-by-imdb|search|discover|endpoint ...');
}

main().catch((error) => {
  console.error('tmdb-lookup failed:', error);
  process.exitCode = 1;
});
