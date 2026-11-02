/**
 * Two independent catch-up passes over Person, run in sequence:
 *
 * 1. Re-fetches TMDB person detail (birthday/deathday/biography/placeOfBirth) for every row
 *    that's missing all of it - people whose original import-time fetch failed (rate limit,
 *    timeout) and, until ensurePerson's own fix in bootstrap-importer.mjs, could also have been
 *    silently blanked back to null again by a *later* re-import's own failed retry. Only ever
 *    updates the detail fields themselves (never name/photo/popularity), and only when this fetch
 *    actually succeeds - a repeat failure here just leaves the row as it was, exactly like the
 *    now-fixed ensurePerson does. Runs daily and re-checks the *same* still-missing rows every
 *    time by design - most turned out to genuinely have nothing on TMDB at all (obscure/minor
 *    cast or crew TMDB itself never filled in), not a fetch failure, so nothing about retrying
 *    them again tomorrow was ever going to succeed. detailFetchAttempts caps that at MAX_ATTEMPTS
 *    per row so this script's own run budget stops going toward rows that have already proven,
 *    repeatedly, they're not going to change - confirmed against real production logs: the same
 *    1068 rows, zero filled, three days straight.
 *
 * 2. Re-translates the biography for every row that HAS one but never got an Arabic translation -
 *    a gap the pass above can't ever close, since its own "all three fields null" query never
 *    matches a row whose detail fetch succeeded but whose Gemini call happened to hit the shared
 *    free-tier quota mid-bulk-import. Nothing else in this codebase ever revisits those rows, so
 *    before this pass existed they stayed untranslated permanently. No attempt cap here - a
 *    translation failing today is just as likely to succeed once tomorrow's quota resets, unlike
 *    phase one's "TMDB genuinely has nothing" case.
 *
 * Runs daily - see TranslationBackfillService.
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

// Phase zero: an Arabic biography straight from TMDB. Most Arab artists have one written in Arabic
// on TMDB but none in English - and every other pass here only ever asked TMDB for English, then
// fed it to Gemini, so they stayed without a biography in the app. Checked for everyone credited on
// an Arabic-language work who has no Arabic biography yet: a TMDB request each (no Gemini quota),
// several at a time.
async function arabicBiographiesFromTmdb() {
  const people = await connectWithRetry(() =>
    prisma.person.findMany({
      where: {
        tmdbId: { not: null },
        biographyAr: null,
        OR: [
          { movieCast: { some: { movie: { originalLanguage: 'ar', deletedAt: null } } } },
          { showCast: { some: { show: { originalLanguage: 'ar', deletedAt: null } } } },
          { movieCrew: { some: { movie: { originalLanguage: 'ar', deletedAt: null } } } },
          { showCrew: { some: { show: { originalLanguage: 'ar', deletedAt: null } } } },
        ],
      },
      select: { id: true, tmdbId: true, name: true },
    }),
  );
  console.log(`Checking ${people.length} people from Arabic works for an Arabic biography on TMDB...`);
  let found = 0;
  let index = 0;
  async function worker() {
    while (index < people.length) {
      const person = people[index++];
      try {
        const detail = await tmdbGet(`/person/${person.tmdbId}`, { language: 'ar' });
        const biographyAr = detail.biography?.trim();
        // TMDB falls back to English when there's no Arabic text - only real Arabic counts.
        if (!biographyAr || !/[\u0600-\u06FF]/.test(biographyAr)) continue;
        await connectWithRetry(() => prisma.person.update({ where: { id: person.id }, data: { biographyAr } }));
        found++;
      } catch (err) {
        console.log(`  - ${person.name}: fetch failed (${err.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`Arabic biographies from TMDB: ${found} of ${people.length}.`);
}

async function main() {
  await arabicBiographiesFromTmdb();

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

  // Second, separate pass: a person whose *detail fetch* succeeded (biography is populated) but
  // whose *translation* never landed - almost always because the shared Gemini free-tier quota
  // was already exhausted by the time this person's turn came up during a bulk import (see
  // translateToArabic's own comment on why that happened far more than expected before the
  // gemini-flash-lite switch). The loop above never touches these rows at all - its own query only
  // matches "all three fields null," which a row with a real biography and a merely-failed
  // translation never satisfies, so a person stuck this way was permanently skipped by this
  // script every single day it ran, with nothing else in the codebase ever revisiting them either.
  // No attempt cap here unlike phase one above - translateToArabic already retries a transient
  // failure several times per call on its own, and unlike "TMDB genuinely has nothing on this
  // person" (a fact that doesn't change tomorrow), a translation failing today is just as likely
  // to succeed once the next day's quota resets, so there's no "this will never change" case to
  // stop retrying for.
  const untranslated = await connectWithRetry(() =>
    prisma.person.findMany({
      where: { biography: { not: null }, biographyAr: null },
      select: { id: true, name: true, biography: true },
    }),
  );
  console.log(`\nRe-checking ${untranslated.length} people with a biography but no Arabic translation yet...`);
  let translated = 0;
  for (const person of untranslated) {
    const biographyAr = await translateToArabic(person.biography);
    if (!biographyAr) {
      console.log(`  - ${person.name}: translation still failing`);
      continue;
    }
    await connectWithRetry(() => prisma.person.update({ where: { id: person.id }, data: { biographyAr } }));
    translated++;
    console.log(`  + ${person.name}`);
  }
  console.log(`Done. Newly translated: ${translated}, still untranslated: ${untranslated.length - translated}.`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
