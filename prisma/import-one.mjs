/**
 * Imports (or re-imports) exactly one movie or show by its TMDB id, reusing bootstrap-
 * importer.mjs's own tested logic (cast/crew/genres/companies/countries/languages/artwork/
 * ageRating/originalLanguage) - never a fresh popular/trending pull, so it only ever touches
 * this one title. Used by the admin backend's "import new" / "re-import" actions (see
 * apps/backend/src/admin/infrastructure/movieImportService.ts), which spawn this as a child
 * process rather than duplicating the import logic a second time in TypeScript.
 *
 * Usage: node prisma/import-one.mjs --type=movie|show --tmdbId=<id>
 * Prints {"id": "<internal-uuid>"} as the last line of stdout on success.
 */
import { PrismaClient } from '@prisma/client';
import { ensureImportProvider, importMovie, importShow, tmdbGet } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const type = arg('type');
  const tmdbId = arg('tmdbId');
  if (type !== 'movie' && type !== 'show') {
    throw new Error('Usage: node prisma/import-one.mjs --type=movie|show --tmdbId=<id>');
  }
  if (!tmdbId) {
    throw new Error('Missing --tmdbId=<id>');
  }

  const provider = await ensureImportProvider();
  const config = await tmdbGet('/configuration');
  const imgBase = config.images.secure_base_url;
  const caches = { genre: new Map(), person: new Map(), company: new Map(), country: new Map(), language: new Map() };
  const counters = { movies: 0, shows: 0, seasons: 0, episodes: 0, errors: 0 };

  if (type === 'movie') {
    await importMovie(caches, imgBase, provider.id, tmdbId, counters);
    const movie = await prisma.movie.findUniqueOrThrow({ where: { tmdbId: String(tmdbId) }, select: { id: true } });
    console.log(JSON.stringify({ id: movie.id }));
  } else {
    await importShow(caches, imgBase, provider.id, tmdbId, counters);
    const show = await prisma.tVShow.findUniqueOrThrow({ where: { tmdbId: String(tmdbId) }, select: { id: true } });
    console.log(JSON.stringify({ id: show.id }));
  }
}

main()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
