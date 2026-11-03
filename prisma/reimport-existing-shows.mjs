/**
 * Runs the full cast/crew enrichment pass (birthday/deathday/biography/biographyAr, correct
 * image-language priority) against the shows that already exist in the DB right now - not a
 * fresh TMDB popular/trending pull (that's what bootstrap-importer.mjs's own collectIds does),
 * which would silently bring back every show trim-shows.mjs just removed. importShow() itself
 * still upserts by tmdbId, so this only ever updates these specific rows, never creates new
 * ones.
 *
 * Usage: node prisma/reimport-existing-shows.mjs
 */
import { PrismaClient } from '@prisma/client';
import { ensureImportProvider, importShow, tmdbGet } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();

async function main() {
  const shows = await prisma.tVShow.findMany({ select: { tmdbId: true, title: true } });
  console.log(`Re-importing ${shows.length} existing shows...`);

  const provider = await ensureImportProvider();
  const config = await tmdbGet('/configuration');
  const imgBase = config.images.secure_base_url;

  const caches = { genre: new Map(), person: new Map(), company: new Map(), country: new Map(), language: new Map() };
  const counters = { movies: 0, shows: 0, seasons: 0, episodes: 0, errors: 0 };

  for (const show of shows) {
    if (!show.tmdbId) continue;
    try {
      await importShow(caches, imgBase, provider.id, show.tmdbId, counters);
      console.log(`  ${show.title} re-imported (${counters.shows} done)`);
    } catch (err) {
      counters.errors++;
      console.error(`  ${show.title} FAILED: ${err.message}`);
    }
  }

  console.log('\nSummary:', counters);
}

main()
  .catch((error) => {
    console.error('Re-import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
