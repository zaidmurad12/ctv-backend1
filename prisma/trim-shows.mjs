/**
 * One-off: keeps only the top N TV shows (by rating) and deletes the rest. Every related row
 * (seasons, episodes, cast/crew links, genres, images, provider links) cascades automatically
 * per the schema's onDelete: Cascade on every TVShow-side relation.
 *
 * Usage: node prisma/trim-shows.mjs [keepCount=10]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const KEEP_COUNT = Number(process.argv[2] ?? 10);

async function main() {
  const shows = await prisma.tVShow.findMany({
    select: { id: true, title: true, rating: true },
    orderBy: { rating: 'desc' },
  });
  console.log(`Found ${shows.length} shows total.`);

  const toKeep = shows.slice(0, KEEP_COUNT);
  const toDelete = shows.slice(KEEP_COUNT);

  console.log(`Keeping ${toKeep.length}:`);
  for (const s of toKeep) console.log(`  - ${s.title} (${s.rating})`);

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const result = await prisma.tVShow.deleteMany({ where: { id: { in: toDelete.map((s) => s.id) } } });
  console.log(`Deleted ${result.count} shows.`);
}

main()
  .catch((error) => {
    console.error('Trim failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
