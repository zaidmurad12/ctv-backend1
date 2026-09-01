/**
 * Re-imports every already-PUBLISHED show from TMDB - the only way this catalog ever picks up a
 * new season or episode TMDB has added since the show was first imported. importShow() already
 * upserts on (showId, seasonNumber)/(seasonId, episodeNumber), so re-running it is naturally
 * idempotent: existing seasons/episodes just get their metadata refreshed, and anything TMDB has
 * added since (respecting the same air-date-import-horizon rule as a fresh import) gets created
 * for the first time. A show that gains an episode this way keeps its PUBLISHED status - the
 * admin's own "hasIncompleteEpisodes" badge (computed fresh from the current DB state on every
 * request) is what surfaces that the new episode still needs a stream/subtitle attached.
 *
 * Usage: node prisma/reimport-published-shows.mjs
 */
import { PrismaClient } from '@prisma/client';
import { ensureImportProvider, importShow, tmdbGet } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(fn, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.log(`  (db unreachable, retrying in 5s: ${err.message.split('\n')[0]})`);
      await sleep(5000);
    }
  }
}

async function main() {
  const provider = await ensureImportProvider();
  const config = await tmdbGet('/configuration');
  const imgBase = config.images.secure_base_url;
  const caches = { genre: new Map(), person: new Map(), company: new Map(), country: new Map(), language: new Map() };
  const counters = { movies: 0, shows: 0, seasons: 0, episodes: 0, errors: 0 };

  const shows = await connectWithRetry(() =>
    prisma.tVShow.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', tmdbId: { not: null } },
      select: { id: true, tmdbId: true, title: true },
    }),
  );
  console.log(`Re-importing ${shows.length} published shows...`);

  for (const show of shows) {
    try {
      const before = { seasons: counters.seasons, episodes: counters.episodes };
      await importShow(caches, imgBase, provider.id, show.tmdbId, counters);
      const newSeasons = counters.seasons - before.seasons;
      const newEpisodes = counters.episodes - before.episodes;
      console.log(`  + ${show.title}${newEpisodes ? ` (touched ${newSeasons} season(s), ${newEpisodes} episode(s))` : ''}`);
    } catch (err) {
      counters.errors++;
      console.log(`  - ${show.title}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${shows.length} shows checked, ${counters.errors} errors.`);
}

main()
  .catch((error) => {
    console.error('Reimport failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
