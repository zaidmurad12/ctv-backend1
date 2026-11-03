/**
 * One-off: fetches a readable-language title logo (see pickLogo in bootstrap-importer.mjs) for every
 * movie/show that has none yet, and writes it to the `logo` column plus a LOGO Image row.
 * Usage: node prisma/backfill-logos.mjs
 */
import { PrismaClient } from '@prisma/client';
import { tmdbGet, pickLogo, LOGO_IMAGE_LANGUAGES } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();
const IMG_BASE = 'https://image.tmdb.org/t/p/';

async function run(kind) {
  const isMovie = kind === 'movie';
  const model = isMovie ? prisma.movie : prisma.tVShow;
  const rows = await model.findMany({
    where: { logo: null, tmdbId: { not: null } },
    select: { id: true, tmdbId: true, originalLanguage: true },
  });
  console.log(`${kind}: ${rows.length} without logo`);
  let found = 0;
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      try {
        const images = await tmdbGet(`/${isMovie ? 'movie' : 'tv'}/${row.tmdbId}/images`, {
          include_image_language: LOGO_IMAGE_LANGUAGES,
        });
        const path = pickLogo(images.logos, row.originalLanguage);
        if (!path) continue;
        const url = `${IMG_BASE}w500${path}`;
        await model.update({ where: { id: row.id }, data: { logo: url } });
        const link = isMovie ? { movieId: row.id } : { showId: row.id };
        const has = await prisma.image.findFirst({ where: { ...link, type: 'LOGO' } });
        if (!has) await prisma.image.create({ data: { ...link, type: 'LOGO', url, provider: 'tmdb' } });
        found++;
      } catch (err) {
        console.warn(`  ${kind} ${row.tmdbId}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`${kind}: logos added for ${found}/${rows.length}`);
}

await run('movie');
await run('show');
await prisma.$disconnect();
