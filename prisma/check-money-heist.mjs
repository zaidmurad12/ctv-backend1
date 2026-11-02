import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const show = await prisma.tVShow.findUnique({
    where: { tmdbId: '71446' },
    include: {
      seasons: {
        orderBy: { seasonNumber: 'asc' },
        include: {
          episodes: {
            orderBy: { episodeNumber: 'asc' },
            include: {
              providers: true,
            },
          },
        },
      },
      providers: true,
    },
  });

  if (!show) {
    console.log('NOT FOUND: no TVShow with tmdbId 71446');
    return;
  }

  console.log('Show:', show.id, show.title, '| numberOfSeasons field:', show.numberOfSeasons, '| numberOfEpisodes field:', show.numberOfEpisodes);
  console.log('Providers:', show.providers.map((p) => ({ providerId: p.providerId, externalId: p.externalId })));
  console.log('Seasons found:', show.seasons.length);
  for (const s of show.seasons) {
    const withStream = s.episodes.filter((e) => e.providers.length > 0).length;
    console.log(
      `  Season ${s.seasonNumber} (id=${s.id}) "${s.name}" - episodes: ${s.episodes.length}, with provider link: ${withStream}`
    );
    for (const e of s.episodes) {
      console.log(`    E${e.episodeNumber} id=${e.id} providers=${e.providers.length} title="${e.title}"`);
    }
  }
}

main()
  .catch((err) => {
    console.error('FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
