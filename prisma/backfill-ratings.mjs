/**
 * Refreshes rating (TMDB vote_average), voteCount and popularity for titles whose rating is still
 * missing/0, plus everything released in the last RECENT_DAYS - a title imported on (or before) its
 * release day has no votes yet, and nothing ever looked at it again, so it showed "IMDb 0" forever.
 * Only writes when TMDB actually has a rating. Run nightly by TranslationBackfillService.
 * Usage: node prisma/backfill-ratings.mjs
 */
import { PrismaClient } from '@prisma/client';
import { tmdbGet } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();
const RECENT_DAYS = 120;

async function run(kind) {
  const isMovie = kind === 'movie';
  const model = isMovie ? prisma.movie : prisma.tVShow;
  const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const rows = await model.findMany({
    where: {
      deletedAt: null,
      tmdbId: { not: null },
      OR: [{ rating: null }, { rating: 0 }, { releaseDate: { gte: recentSince, lte: new Date() } }],
    },
    select: { id: true, tmdbId: true, rating: true, voteCount: true },
  });
  let updated = 0;
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      try {
        const data = await tmdbGet(`/${isMovie ? 'movie' : 'tv'}/${row.tmdbId}`, {});
        const rating = Number(data.vote_average ?? 0);
        const voteCount = Number(data.vote_count ?? 0);
        if (!(rating > 0)) continue;
        if (Number(row.rating ?? 0) === Math.round(rating * 100) / 100 && row.voteCount === voteCount) continue;
        await model.update({
          where: { id: row.id },
          data: { rating: Math.round(rating * 100) / 100, voteCount, popularity: Math.round(Number(data.popularity ?? 0) * 100) / 100 },
        });
        updated++;
      } catch (err) {
        console.warn(`  ${kind} ${row.tmdbId}: fetch failed (${err.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return { checked: rows.length, updated };
}

const movies = await run('movie');
const shows = await run('show');
await prisma.$disconnect();
// Last line is what TranslationBackfillService logs as the summary.
console.log(`Done. movies: ${movies.updated} updated of ${movies.checked} checked; shows: ${shows.updated} updated of ${shows.checked} checked.`);
