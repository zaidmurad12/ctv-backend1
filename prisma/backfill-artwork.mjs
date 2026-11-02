/**
 * Fills in a missing poster and/or backdrop for every movie/show that has none yet, using the same
 * picking rules as a fresh import (see pickImageByLang/pickBackdrop in bootstrap-importer.mjs):
 * Arabic posters for Arabic-language works, English otherwise; textless, high-res, best-voted
 * backdrops. Only the missing field(s) are written - an existing poster/backdrop is never replaced.
 * Run nightly by TranslationBackfillService, next to backfill-logos.mjs (its logo counterpart), so a
 * title that gets artwork on TMDB after it was imported picks it up automatically.
 * Usage: node prisma/backfill-artwork.mjs
 */
import { PrismaClient } from '@prisma/client';
import { tmdbGet, pickImageByLang, pickBackdrop, enArOnly, LOGO_IMAGE_LANGUAGES } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();
const IMG_BASE = 'https://image.tmdb.org/t/p/';

async function run(kind) {
  const isMovie = kind === 'movie';
  const model = isMovie ? prisma.movie : prisma.tVShow;
  const rows = await model.findMany({
    where: { deletedAt: null, tmdbId: { not: null }, OR: [{ poster: null }, { poster: '' }, { backdrop: null }, { backdrop: '' }] },
    select: { id: true, tmdbId: true, originalLanguage: true, poster: true, backdrop: true },
  });
  console.log(`${kind}: ${rows.length} missing a poster or backdrop`);
  let posters = 0;
  let backdrops = 0;
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      try {
        const data = await tmdbGet(`/${isMovie ? 'movie' : 'tv'}/${row.tmdbId}`, {
          append_to_response: 'images',
          include_image_language: LOGO_IMAGE_LANGUAGES,
        });
        const update = {};
        if (!row.poster) {
          const path = pickImageByLang(enArOnly(data.images?.posters), row.originalLanguage) ?? data.poster_path;
          if (path) update.poster = `${IMG_BASE}w500${path}`;
        }
        if (!row.backdrop) {
          const path = pickBackdrop(data.images?.backdrops, data.backdrop_path);
          if (path) update.backdrop = `${IMG_BASE}w1280${path}`;
        }
        if (Object.keys(update).length === 0) continue;
        await model.update({ where: { id: row.id }, data: update });
        const link = isMovie ? { movieId: row.id } : { showId: row.id };
        for (const [field, type] of [['poster', 'POSTER'], ['backdrop', 'BACKDROP']]) {
          if (!update[field]) continue;
          const has = await prisma.image.findFirst({ where: { ...link, type } });
          if (!has) await prisma.image.create({ data: { ...link, type, url: update[field], provider: 'tmdb' } });
          if (field === 'poster') posters++;
          else backdrops++;
        }
      } catch (err) {
        console.warn(`  ${kind} ${row.tmdbId}: fetch failed (${err.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return { rows: rows.length, posters, backdrops };
}

const movies = await run('movie');
const shows = await run('show');
await prisma.$disconnect();
// Last line is what TranslationBackfillService logs as the summary - keep both kinds on it.
console.log(
  `Done. movies: +${movies.posters} posters, +${movies.backdrops} backdrops (of ${movies.rows} missing); ` +
    `shows: +${shows.posters} posters, +${shows.backdrops} backdrops (of ${shows.rows} missing).`,
);
