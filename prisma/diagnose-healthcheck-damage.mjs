import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // healthCheck() only ever touches Movie.streamHealthCheckedAt - any non-null value here means
  // this pass ran against that movie at least once (it's never set anywhere else in the codebase).
  const touched = await prisma.movie.findMany({
    where: { streamHealthCheckedAt: { not: null } },
    select: {
      id: true,
      title: true,
      status: true,
      streamHealthCheckedAt: true,
      providers: {
        select: {
          id: true,
          providerId: true,
          streams: { select: { id: true, isActive: true, streamUrl: true, updatedAt: true } },
        },
      },
    },
    orderBy: { streamHealthCheckedAt: 'desc' },
  });

  console.log(`Movies touched by healthCheck: ${touched.length}`);
  const draftedByHealthcheck = touched.filter((m) => m.status === 'DRAFT');
  console.log(`Of those, currently DRAFT: ${draftedByHealthcheck.length}`);

  let totalDeactivatedStreams = 0;
  for (const m of touched) {
    const deactivated = m.providers.flatMap((p) => p.streams).filter((s) => !s.isActive);
    totalDeactivatedStreams += deactivated.length;
  }
  console.log(`Total inactive Stream rows on healthCheck-touched movies: ${totalDeactivatedStreams}`);

  console.log('\n--- Sample (first 20 drafted) ---');
  for (const m of draftedByHealthcheck.slice(0, 20)) {
    const streams = m.providers.flatMap((p) => p.streams);
    console.log(
      `${m.id} | "${m.title}" | checkedAt=${m.streamHealthCheckedAt?.toISOString()} | streams: ${streams.length} (active=${streams.filter((s) => s.isActive).length}, inactive=${streams.filter((s) => !s.isActive).length})`
    );
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
