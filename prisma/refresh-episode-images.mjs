/**
 * Re-fetches one show's episode images (TMDB "stills") from TMDB - for the admin panel's
 * "re-import episode images" button. Nothing about the show itself or its seasons is touched.
 *
 * Two cases:
 *  - The show's seasons match TMDB's (same season numbers, same episode counts): each episode gets
 *    the still of the same season/episode on TMDB. Only images change.
 *  - The show was split differently from TMDB (restructure-seasons: e.g. Money Heist is 3 seasons
 *    on TMDB but 5 parts here, the way the sources number it): matching by season/episode number
 *    gave episodes another episode's image (and a split that shifted episodes left titles and
 *    descriptions on the wrong episodes too). Here every episode is lined up with TMDB's episodes
 *    in broadcast order - from the start for the first ones and from the end for the last ones -
 *    and gets that TMDB episode's image, title, Arabic title and descriptions. Episodes in the
 *    middle that TMDB doesn't list (the show has more episodes than TMDB) get a plain
 *    "Episode N" and no image rather than someone else's.
 *
 * Usage: node prisma/refresh-episode-images.mjs --showId=<catalog show id>
 * Prints a final JSON line: { updated, unchanged, missing, seasons, mode }.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(path.resolve(__dirname, '..'), '.env'));
} catch {
  // Real environment variables already set.
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';
// Same size bootstrap-importer.mjs stores episode stills at.
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';
const prisma = new PrismaClient();

const showId = process.argv.find((arg) => arg.startsWith('--showId='))?.split('=')[1];

async function tmdbGet(pathname, language = 'en-US') {
  const url = new URL(TMDB_BASE + pathname);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', language);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      continue;
    }
    throw new Error(`TMDB ${response.status} ${pathname}`);
  }
  throw new Error(`TMDB request failed: ${pathname}`);
}

async function main() {
  if (!showId) throw new Error('--showId is required');
  if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY is missing');
  const show = await prisma.tVShow.findFirst({
    where: { id: showId, deletedAt: null },
    select: {
      tmdbId: true,
      seasons: {
        orderBy: { seasonNumber: 'asc' },
        select: {
          seasonNumber: true,
          episodes: {
            orderBy: { episodeNumber: 'asc' },
            select: { id: true, episodeNumber: true, stillImage: true, title: true, titleAr: true, overview: true, overviewAr: true },
          },
        },
      },
    },
  });
  if (!show) throw new Error(`Show ${showId} not found`);
  if (!show.tmdbId) throw new Error(`Show ${showId} has no TMDB id`);

  // TMDB's own layout (season 0 = specials, never part of the numbered run).
  const info = await tmdbGet(`/tv/${show.tmdbId}`);
  const tmdbSeasons = (info.seasons ?? []).filter((s) => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
  const ours = show.seasons.filter((s) => s.seasonNumber > 0);
  const sameLayout =
    ours.length === tmdbSeasons.length &&
    ours.every((s, i) => s.seasonNumber === tmdbSeasons[i].season_number && s.episodes.length <= tmdbSeasons[i].episode_count);

  // Every TMDB episode in broadcast order, English and Arabic.
  const tmdbEpisodes = [];
  const bySeasonEpisode = new Map();
  for (const season of tmdbSeasons) {
    const [en, ar] = await Promise.all([
      tmdbGet(`/tv/${show.tmdbId}/season/${season.season_number}`),
      tmdbGet(`/tv/${show.tmdbId}/season/${season.season_number}`, 'ar').catch(() => ({ episodes: [] })),
    ]);
    const arByNumber = new Map((ar.episodes ?? []).map((ep) => [ep.episode_number, ep]));
    for (const ep of (en.episodes ?? []).sort((a, b) => a.episode_number - b.episode_number)) {
      const entry = { en: ep, ar: arByNumber.get(ep.episode_number) };
      tmdbEpisodes.push(entry);
      bySeasonEpisode.set(`${season.season_number}:${ep.episode_number}`, entry);
    }
  }

  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  if (sameLayout) {
    for (const season of ours) {
      for (const episode of season.episodes) {
        const entry = bySeasonEpisode.get(`${season.seasonNumber}:${episode.episodeNumber}`);
        const stillPath = entry?.en.still_path;
        if (!stillPath) {
          missing++;
          continue;
        }
        const url = IMAGE_BASE + stillPath;
        if (url === episode.stillImage) {
          unchanged++;
          continue;
        }
        await prisma.episode.update({ where: { id: episode.id }, data: { stillImage: url } });
        updated++;
      }
    }
  } else {
    const flat = ours.flatMap((season) => season.episodes);
    const total = flat.length;
    const tmdbTotal = tmdbEpisodes.length;
    // Lined up from both ends: the first min(total, tmdbTotal) from the start... but when the
    // counts differ, the extra (or missing) episodes sit somewhere in the middle, so the tail is
    // lined up from the end instead. Split point: TMDB's first season stays anchored at the start.
    const headCount = Math.min(total, tmdbTotal, tmdbSeasons[0]?.episode_count ?? 0);
    const tailCount = Math.min(total - headCount, tmdbTotal - headCount);
    for (let i = 0; i < total; i++) {
      const episode = flat[i];
      let entry;
      if (i < headCount) entry = tmdbEpisodes[i];
      else if (i >= total - tailCount) entry = tmdbEpisodes[tmdbTotal - (total - i)];
      const data = entry
        ? {
            stillImage: entry.en.still_path ? IMAGE_BASE + entry.en.still_path : null,
            title: entry.en.name || `Episode ${episode.episodeNumber}`,
            titleAr: entry.ar?.name?.trim() || null,
            overview: entry.en.overview || null,
            overviewAr: entry.ar?.overview?.trim() || null,
          }
        : { stillImage: null, title: `Episode ${episode.episodeNumber}`, titleAr: null, overview: null, overviewAr: null };
      if (!entry) missing++;
      const same =
        data.stillImage === episode.stillImage &&
        data.title === episode.title &&
        data.titleAr === episode.titleAr &&
        data.overview === episode.overview &&
        data.overviewAr === episode.overviewAr;
      if (same) {
        unchanged++;
        continue;
      }
      await prisma.episode.update({ where: { id: episode.id }, data });
      updated++;
    }
  }
  console.log(JSON.stringify({ updated, unchanged, missing, seasons: ours.length, mode: sameLayout ? 'same-layout' : 'realigned' }));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
