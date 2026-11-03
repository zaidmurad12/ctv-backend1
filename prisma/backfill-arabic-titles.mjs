/**
 * Fills in titleAr for every Arabic-original Movie/TVShow that's missing it - an Arabic movie/show
 * with no Arabic title on file falls back to weaker English/fuzzy matching against CEE/Cinemana's
 * own Arabic title (see calculateMatchScore's exact-Arabic-title path in the RN app's api.ts),
 * which is exactly the case this exists to close. Scoped to originalLanguage 'ar' only - a
 * non-Arabic title missing titleAr isn't this problem (see backfill-overview-translations.mjs for
 * the separate, all-languages overview backfill this mirrors the structure of).
 *
 * Prefers TMDB's own community Arabic translation (the same canonical name CEE/Cinemana are also
 * likely to use) over a Gemini machine translation of the English title - only falls back to the
 * latter when TMDB genuinely has no Arabic translation on file for that title.
 *
 * Usage: node prisma/backfill-arabic-titles.mjs
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
  // For an Arabic-language title TMDB's own original_title/original_name IS the Arabic name, and
  // TMDB never lists a separate Arabic translation for a work's original language - so without
  // this, nearly every row here fell through to Gemini (slow, rate-limited, and a literal
  // translation rarely matches the name CEE/Cinemana actually use).
  const originalName = (kind === 'movie' ? data.original_title : data.original_name) ?? '';
  const arabicOriginal = /[؀-ۿ]/.test(originalName) ? originalName.trim() : null;
  const titleAr = arabic.title || arabicOriginal || (row.title ? await translateToArabic(row.title) : null);
  if (!titleAr) {
    console.log(`  - ${row.title}: no Arabic title available (TMDB or Gemini)`);
    return false;
  }
  const model = kind === 'movie' ? prisma.movie : prisma.tVShow;
  await connectWithRetry(() => model.update({ where: { id: row.id }, data: { titleAr } }));
  console.log(`  + ${row.title} -> ${titleAr}`);
  return true;
}

async function main() {
  const where = {
    deletedAt: null,
    tmdbId: { not: null },
    originalLanguage: 'ar',
    OR: [{ titleAr: null }, { titleAr: '' }],
  };
  const movies = await connectWithRetry(() =>
    prisma.movie.findMany({ where, select: { id: true, tmdbId: true, title: true } }),
  );
  const shows = await connectWithRetry(() =>
    prisma.tVShow.findMany({ where, select: { id: true, tmdbId: true, title: true } }),
  );
  console.log(`Backfilling titleAr for ${movies.length} Arabic movies and ${shows.length} Arabic shows...`);

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
