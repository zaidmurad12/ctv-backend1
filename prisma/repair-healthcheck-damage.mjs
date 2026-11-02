import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off repair for the 2026-09-19 05:00 UTC scheduled-import run: healthCheck() probed every
// active Stream URL, but Cloud Run cannot reach cee.buzz/cinemana.shabakaty.com at all right now
// (confirmed via logs - "fetch failed" on every request, while the same URLs work fine from
// outside Cloud Run), so every single probe in that run failed and was wrongly treated as "this
// link is dead". That deactivated the Stream and, since it was each movie's only stream, flipped
// the movie to DRAFT (removing it from the public catalog) via applyPublishPolicy. Diagnostic
// query confirmed: exactly the movies with Movie.streamHealthCheckedAt set (this field is written
// nowhere else in the codebase - healthCheck is a brand-new pass added this session, so every row
// with it set was touched by this one broken run) - 150 movies, 138 flipped to DRAFT, 143 Stream
// rows deactivated. This undoes both: reactivates every Stream on a healthCheck-touched movie and
// republishes any movie whose only problem was this false deactivation. streamHealthCheckedAt is
// cleared so a *real*, working healthCheck (once the Cloud Run egress issue is fixed and this pass
// is re-enabled - see scheduledImportService.ts's own comment) re-probes fresh rather than waiting
// out HEALTHCHECK_RETRY_DAYS.
async function main() {
  const touched = await prisma.movie.findMany({
    where: { streamHealthCheckedAt: { not: null } },
    select: {
      id: true,
      title: true,
      status: true,
      providers: { select: { streams: { select: { id: true, isActive: true } } } },
    },
  });

  let reactivatedStreams = 0;
  let republishedMovies = 0;

  for (const movie of touched) {
    const streamIds = movie.providers.flatMap((p) => p.streams).filter((s) => !s.isActive).map((s) => s.id);
    if (streamIds.length > 0) {
      await prisma.stream.updateMany({ where: { id: { in: streamIds } }, data: { isActive: true } });
      reactivatedStreams += streamIds.length;
    }

    const activeCount = await prisma.stream.count({
      where: { movieProvider: { movieId: movie.id }, isActive: true },
    });
    if (activeCount > 0 && movie.status !== 'PUBLISHED') {
      await prisma.movie.update({
        where: { id: movie.id },
        data: { status: 'PUBLISHED', streamHealthCheckedAt: null },
      });
      republishedMovies += 1;
    } else {
      await prisma.movie.update({ where: { id: movie.id }, data: { streamHealthCheckedAt: null } });
    }
  }

  console.log(`Movies touched: ${touched.length}`);
  console.log(`Streams reactivated: ${reactivatedStreams}`);
  console.log(`Movies republished (DRAFT -> PUBLISHED): ${republishedMovies}`);
}

main()
  .catch((err) => {
    console.error('FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
