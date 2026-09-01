/**
 * Attaches an OpenSubtitles subtitle to every existing movie that doesn't already have one -
 * a one-off catch-up pass for movies imported before ensureSubtitle existed in
 * bootstrap-importer.mjs. Every future import already does this automatically; this just
 * covers the backlog. Idempotent (ensureSubtitle itself skips anything already covered), so
 * safe to re-run if OpenSubtitles' daily download quota is hit partway through.
 *
 * Usage: node prisma/backfill-movie-subtitles.mjs
 */
import { PrismaClient } from '@prisma/client';
import { ensureSubtitle } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();

async function main() {
  // Arabic-language movies don't need an Arabic subtitle - the audio itself already is Arabic.
  const movies = await prisma.movie.findMany({
    where: { deletedAt: null, originalLanguage: { not: 'ar' } },
    select: { id: true, title: true, releaseDate: true, imdbId: true },
  });
  console.log(`Checking ${movies.length} non-Arabic movies for a missing subtitle...`);

  let attached = 0;
  let skipped = 0;
  for (const movie of movies) {
    const before = await prisma.subtitle.count({ where: { movieProvider: { movieId: movie.id } } });
    if (before > 0) {
      skipped++;
      continue;
    }
    const year = movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null;
    await ensureSubtitle(movie.id, movie.title, year, movie.imdbId);
    const after = await prisma.subtitle.count({ where: { movieProvider: { movieId: movie.id } } });
    if (after > 0) {
      attached++;
      console.log(`  + ${movie.title}`);
    } else {
      console.log(`  - ${movie.title} (no match found)`);
    }
  }

  console.log(`\nDone. Attached: ${attached}, already had one: ${skipped}, no match: ${movies.length - attached - skipped}.`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
