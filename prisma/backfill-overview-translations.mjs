/**
 * Fills in overviewAr for every Movie/TVShow that's missing it - a catch-up pass for everything
 * imported before overviewAr existed at all (only new imports/reimports ever set it). Prefers
 * TMDB's own free community Arabic translation (a second, cheap request per title); only calls
 * Gemini (translateToArabic, already quota-limited and shared with the person-detail backfill)
 * when TMDB genuinely has nothing for that title.
 *
 * Usage: node prisma/backfill-overview-translations.mjs
 */
import { PrismaClient } from '@prisma/client';
import { tmdbGet, translateToArabic, extractArabicTranslation } from './bootstrap-importer.mjs';

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

async function backfillOne(kind, row) {
  const path = kind === 'movie' ? `/movie/${row.tmdbId}` : `/tv/${row.tmdbId}`;
  let data;
  try {
    data = await tmdbGet(path, { append_to_response: 'translations', language: 'en-US' });
  } catch (err) {
    console.log(`  - ${row.title}: TMDB fetch failed (${err.message})`);
    return false;
  }
  const arabic = extractArabicTranslation(data.translations, kind === 'show');
  const overviewAr = arabic.overview || (row.overview ? await translateToArabic(row.overview) : null);
  if (!overviewAr) {
    console.log(`  - ${row.title}: no Arabic overview available (TMDB or Gemini)`);
    return false;
  }
  const model = kind === 'movie' ? prisma.movie : prisma.tVShow;
  await connectWithRetry(() => model.update({ where: { id: row.id }, data: { overviewAr } }));
  console.log(`  + ${row.title}`);
  return true;
}

async function main() {
  const movies = await connectWithRetry(() =>
    prisma.movie.findMany({
      where: { deletedAt: null, tmdbId: { not: null }, overview: { not: null }, overviewAr: null },
      select: { id: true, tmdbId: true, title: true, overview: true },
    }),
  );
  const shows = await connectWithRetry(() =>
    prisma.tVShow.findMany({
      where: { deletedAt: null, tmdbId: { not: null }, overview: { not: null }, overviewAr: null },
      select: { id: true, tmdbId: true, title: true, overview: true },
    }),
  );
  console.log(`Backfilling overviewAr for ${movies.length} movies and ${shows.length} shows...`);

  let filled = 0;
  for (const row of movies) {
    if (await backfillOne('movie', row)) filled++;
  }
  for (const row of shows) {
    if (await backfillOne('show', row)) filled++;
  }

  console.log(`\nDone. Filled in: ${filled} of ${movies.length + shows.length}.`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
