/**
 * One-off cleanup: removes every Stream/Subtitle row created by the old bootstrap-importer.mjs
 * behavior (it used to attach two fake "Demo Server" streams + demo subtitle files to every
 * movie/episode - see that script's own updated comment). Every row in these two tables today
 * is that placeholder data, since nothing else has ever written a real one yet - safe to clear
 * entirely rather than filtering by provider.
 *
 * Usage: node prisma/clear-demo-streams.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const streams = await prisma.stream.deleteMany({});
  const subtitles = await prisma.subtitle.deleteMany({});
  console.log(`Deleted ${streams.count} streams and ${subtitles.count} subtitles.`);
}

main()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
