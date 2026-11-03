// One-off migration: Money Heist (TMDB tv/71446) is currently imported as 3 native TMDB seasons
// (15+16+10 = 41 episodes). The viewer wants it split into TMDB's own "Original Parts" grouping
// instead (5 parts) - verified via TMDB's /tv/episode_group/5ae0275b0e0a26156c00de9f endpoint to
// exactly cover the same 41 existing episodes with the same real season/episode numbers already
// in the database (unlike the *other* TMDB grouping, "Parts (edited version)", which re-cuts
// season 1 into a different, shorter set of episodes that don't exist in this catalog's imported
// data or its already-linked streams at all - not usable without new source video).
//
// This only ever reassigns existing Episode rows to new Season rows (seasonId + episodeNumber),
// never deletes or recreates an Episode itself - every EpisodeProvider/Stream/WatchHistory/
// ContinueWatching row (all foreign-keyed on episodeId) stays attached to the exact same episode
// it already was, untouched.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SHOW_TMDB_ID = '71446';
// From TMDB's own "Original Parts" episode group - see this file's own comment above.
const PARTS = [
  { part: 1, season: 1, from: 1, to: 9 },
  { part: 2, season: 1, from: 10, to: 15 },
  { part: 3, season: 2, from: 1, to: 8 },
  { part: 4, season: 2, from: 9, to: 16 },
  { part: 5, season: 3, from: 1, to: 10 },
];
// Old seasonNumbers are 1-3, new ones will also land on 1-5 - staging the new seasons at a high
// offset first (then renumbering down once the old rows are gone) sidesteps the
// @@unique([showId, seasonNumber]) constraint the two schemes would otherwise collide on while
// both exist side by side mid-migration.
const TEMP_OFFSET = 100;

async function main() {
  const show = await prisma.tVShow.findUnique({
    where: { tmdbId: SHOW_TMDB_ID },
    include: { seasons: { include: { episodes: true } } },
  });
  if (!show) throw new Error('Show not found (tmdbId 71446)');

  const seasonByNumber = new Map(show.seasons.map((s) => [s.seasonNumber, s]));

  const plan = PARTS.map((p) => {
    const oldSeason = seasonByNumber.get(p.season);
    if (!oldSeason) throw new Error(`Part ${p.part}: source season ${p.season} not found`);
    const episodes = oldSeason.episodes
      .filter((e) => e.episodeNumber >= p.from && e.episodeNumber <= p.to)
      .sort((a, b) => a.episodeNumber - b.episodeNumber);
    const expected = p.to - p.from + 1;
    if (episodes.length !== expected) {
      throw new Error(`Part ${p.part}: expected ${expected} episodes (S${p.season}E${p.from}-${p.to}), found ${episodes.length}`);
    }
    return { ...p, episodes };
  });

  console.log('Plan verified - every part maps onto existing episodes exactly:');
  for (const p of plan) {
    console.log(`  Part ${p.part}: ${p.episodes.length} episodes from current Season ${p.season} E${p.from}-${p.to}`);
  }

  await prisma.$transaction(async (tx) => {
    // Step 1: create the 5 new "part" seasons at temporary season numbers.
    const created = [];
    for (const p of plan) {
      const season = await tx.season.create({
        data: {
          showId: show.id,
          seasonNumber: TEMP_OFFSET + p.part,
          name: `Part ${p.part}`,
          episodeCount: p.episodes.length,
        },
      });
      created.push({ part: p.part, seasonId: season.id, episodes: p.episodes });
    }

    // Step 2: reassign every existing episode to its new season, renumbered 1..N within that
    // part - the same Episode id throughout, so every relation on it survives untouched.
    for (const c of created) {
      let n = 1;
      for (const ep of c.episodes) {
        await tx.episode.update({ where: { id: ep.id }, data: { seasonId: c.seasonId, episodeNumber: n } });
        n++;
      }
    }

    // Step 3: the original 3 seasons are now empty (every episode moved away in step 2) - safe
    // to delete outright.
    for (const oldSeason of show.seasons) {
      await tx.season.delete({ where: { id: oldSeason.id } });
    }

    // Step 4: renumber the 5 new seasons down from their temporary 101-105 range to the real 1-5
    // now that nothing else occupies those numbers for this show.
    for (const c of created) {
      await tx.season.update({ where: { id: c.seasonId }, data: { seasonNumber: c.part } });
    }

    // Step 5: the show's own numberOfSeasons metadata - numberOfEpisodes is unchanged (still 41,
    // same episodes, just regrouped).
    await tx.tVShow.update({ where: { id: show.id }, data: { numberOfSeasons: 5 } });

    console.log('Transaction committed: 3 seasons -> 5 parts, all episode ids/streams preserved.');
  }, {
    // Default interactive-transaction timeout (5s) wasn't enough for 41 sequential episode
    // updates plus the season create/delete/renumber steps, each its own round trip to a remote
    // Neon database that can also need a moment to wake from serverless idle (see
    // backfill-person-details.mjs's own comment on the same behavior) - raised well past what
    // this migration actually needs rather than cutting it closer and risking the same timeout
    // again mid-run.
    timeout: 60000,
    maxWait: 15000,
  });
}

main()
  .catch((err) => {
    console.error('FAILED (transaction rolled back, nothing changed):', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
