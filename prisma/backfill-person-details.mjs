/**
 * Re-fetches TMDB person detail (birthday/deathday/biography/placeOfBirth) for every Person row
 * that's missing all of it - a one-off catch-up pass for people whose original import-time fetch
 * failed (rate limit, timeout) and, until ensurePerson's own fix in bootstrap-importer.mjs,
 * could also have been silently blanked back to null again by a *later* re-import's own failed
 * retry. Only ever updates the detail fields themselves (never name/photo/popularity), and only
 * when this fetch actually succeeds - a repeat failure here just leaves the row as it was,
 * exactly like the now-fixed ensurePerson does.
 *
 * Runs daily (see TranslationBackfillService) and re-checks the *same* still-missing rows every
 * time by design - most turned out to genuinely have nothing on TMDB at all (obscure/minor cast
 * or crew TMDB itself never filled in), not a fetch failure, so nothing about retrying them again
 * tomorrow was ever going to succeed. detailFetchAttempts caps that at MAX_ATTEMPTS per row so
 * this script's own run budget stops going toward rows that have already proven, repeatedly,
 * they're not going to change - confirmed against real production logs: the same 1068 rows,
 * zero filled, three days straight.
 *
 * Usage: node prisma/backfill-person-details.mjs
 */
import { PrismaClient } from '@prisma/client';
import { tmdbGet, translateToArabic } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();
const MAX_ATTEMPTS = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(fn, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.log(`  (db unreachable, retrying in 5s: ${err.message.split('\n')[0]})`);
      await sleep(5000);
    }
  }
}

async function main() {
  // All three null is the signal a fetch never actually succeeded - a real, if obscure, person
  // can plausibly be missing just one of these (TMDB has no birthday on file for them, say), but
  // essentially never all three at once unless the import-time lookup itself failed outright.
  // Neon's serverless compute can be cold/suspended right when this starts, hence the retry -
  // it just needs a moment to wake up, not anything actually wrong.
  const people = await connectWithRetry(() =>
    prisma.person.findMany({
      where: {
        tmdbId: { not: null },
        birthday: null,
        biography: null,
        placeOfBirth: null,
        detailFetchAttempts: { lt: MAX_ATTEMPTS },
      },
      select: { id: true, tmdbId: true, name: true, detailFetchAttempts: true },
    }),
  );
  console.log(`Re-checking ${people.length} people with no detail on file (under ${MAX_ATTEMPTS} attempts)...`);

  let filled = 0;
  let stillMissing = 0;
  let gaveUp = 0;
  for (const person of people) {
    let detail;
    try {
      detail = await tmdbGet(`/person/${person.tmdbId}`, { language: 'en-US' });
    } catch (err) {
      console.log(`  - ${person.name}: fetch failed (${err.message})`);
      if (person.detailFetchAttempts + 1 >= MAX_ATTEMPTS) gaveUp++;
      await connectWithRetry(() =>
        prisma.person.update({
          where: { id: person.id },
          data: { detailFetchAttempts: { increment: 1 } },
        }),
      );
      stillMissing++;
      continue;
    }
    const biography = detail.biography?.trim() || null;
    const birthday = detail.birthday ? new Date(detail.birthday) : null;
    const placeOfBirth = detail.place_of_birth?.trim() || null;
    if (!biography && !birthday && !placeOfBirth) {
      // Genuinely nothing on TMDB for this person, not a fetch failure - counts toward the same
      // attempt cap, since a person TMDB has had nothing on for MAX_ATTEMPTS days running isn't
      // meaningfully different from one whose fetch kept erroring out.
      if (person.detailFetchAttempts + 1 >= MAX_ATTEMPTS) gaveUp++;
      await connectWithRetry(() =>
        prisma.person.update({
          where: { id: person.id },
          data: { detailFetchAttempts: { increment: 1 } },
        }),
      );
      stillMissing++;
      continue;
    }
    const data = {
      birthday,
      deathday: detail.deathday ? new Date(detail.deathday) : null,
      biography,
      biographyAr: biography ? await translateToArabic(biography) : null,
      placeOfBirth,
    };
    // Neon's serverless connections drop under a long-running script with real gaps between
    // requests (each person here costs a TMDB round trip, sometimes a Gemini one too) - one
    // retry after a short pause covers that without needing a whole separate reconnect/pooling
    // setup for what's already a resumable, idempotent one-off script (a person left unfilled
    // here just gets picked up again by the next run, since the query above only ever selects
    // people still missing everything).
    await connectWithRetry(() => prisma.person.update({ where: { id: person.id }, data }));
    filled++;
    console.log(`  + ${person.name}`);
  }

  console.log(
    `\nDone. Filled in: ${filled}, still nothing on TMDB or fetch kept failing: ${stillMissing} (${gaveUp} of those just hit the ${MAX_ATTEMPTS}-attempt cap and won't be retried again).`,
  );
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
