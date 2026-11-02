import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// Same root cause as repair-healthcheck-damage.mjs: sourceMatchCheck's findSourceMatch swallows a
// per-source network failure and returns null instead of surfacing "couldn't check", so every one
// of the 50 movies checked today got hasSourceMatch:false written even though the check never
// actually reached either source. Clearing both fields makes them eligible for a real re-check
// once sourceMatchCheck is re-enabled (see scheduledImportService.ts's own comment on why it's
// disabled for now) instead of leaving the false "not compatible" badge showing in admin.
async function main() {
  const result = await prisma.movie.updateMany({
    where: { sourceMatchCheckedAt: { not: null } },
    data: { hasSourceMatch: null, sourceMatchCheckedAt: null },
  });
  console.log(`Cleared hasSourceMatch/sourceMatchCheckedAt on ${result.count} movies`);
}
main().finally(() => prisma.$disconnect());
