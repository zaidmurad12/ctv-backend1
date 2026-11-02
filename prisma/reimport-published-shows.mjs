/**
 * Re-imports already-PUBLISHED shows from TMDB - the only way this catalog ever picks up a new
 * season or episode TMDB has added since the show was first imported. importShow() upserts on
 * (showId, seasonNumber)/(seasonId, episodeNumber), so re-running it is idempotent: existing
 * seasons/episodes get their names, overviews, stills and air dates refreshed, and anything TMDB
 * has added since (within bootstrap-importer's air-date horizon) is created.
 *
 * Every published show participates in one rotating queue ordered by updatedAt. Each attempted
 * title (including failures) moves to the back, so a large set of ongoing shows cannot permanently
 * starve ended titles and a recent metadata edit cannot exclude a show from future checks. The
 * scheduler runs hourly; each bounded pass continues with the oldest unrefreshed rows.
 *
 * Episodes and seasons already in the catalog with a missing still, name, overview or runtime are
 * "marked" simply by what they lack (see missingEpisodeFields): they stay in the metadata pass, and
 * are looked up again every CATALOG_MISSING_METADATA_RETRY_DAYS until TMDB has the data. Only what
 * aired in the last CATALOG_MISSING_METADATA_RECENT_DAYS (or hasn't aired yet) counts: TMDB doesn't
 * fill in old episodes later, so retrying them only crowds out the recent ones. That pass
 * runs first with its own share of the time - it used to run last, after the show queue had already
 * used the whole budget, so it never got to run at all.
 *
 * Usage: node prisma/reimport-published-shows.mjs
 */
import { PrismaClient } from '@prisma/client';
import { ensureImportProvider, tmdbGet } from './bootstrap-importer.mjs';

const prisma = new PrismaClient();

const TIME_BUDGET_MS = Number(process.env.CATALOG_REFRESH_BUDGET_MIN ?? 24) * 60 * 1000;
const MISSING_METADATA_RETRY_DAYS = Number(process.env.CATALOG_MISSING_METADATA_RETRY_DAYS ?? 1);
const MISSING_METADATA_BUDGET_MS = Number(process.env.CATALOG_MISSING_METADATA_BUDGET_MIN ?? 10) * 60 * 1000;
const MISSING_METADATA_RECENT_DAYS = Number(process.env.CATALOG_MISSING_METADATA_RECENT_DAYS ?? 365);
const DAY_MS = 24 * 60 * 60 * 1000;

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

const AIR_DATE_HORIZON_DAYS = 60; // same as bootstrap-importer's AIR_DATE_IMPORT_HORIZON_DAYS

function importable(dateStr) {
  return !!dateStr && new Date(dateStr).getTime() <= Date.now() + AIR_DATE_HORIZON_DAYS * DAY_MS;
}

function img(base, size, path) {
  return path ? `${base}${size}${path}` : null;
}

function episodeFields(ep, epAr, imgBase) {
  return {
    title: ep.name || `Episode ${ep.episode_number}`,
    titleAr: epAr?.name?.trim() || null,
    overview: ep.overview || null,
    overviewAr: epAr?.overview?.trim() || null,
    runtime: ep.runtime || null,
    airDate: ep.air_date ? new Date(ep.air_date) : null,
    rating: ep.vote_average ?? null,
    voteCount: ep.vote_count ?? 0,
    stillImage: img(imgBase, 'w300', ep.still_path),
  };
}

async function createMissingEpisodeBatch(seasonId, episodeRows, providerId, showTmdbId, canonicalSeasonNumber, imgBase) {
  if (episodeRows.length === 0) return 0;
  // Avoid one Prisma round trip per episode. Long-running shows can have hundreds of entries in a
  // season; the old episode.upsert + episodeProvider.upsert loop alone could consume the entire
  // 30-minute Scheduler deadline on a single show and make every later title starve.
  const chunkSize = 200;
  let insertedCount = 0;
  for (let i = 0; i < episodeRows.length; i += chunkSize) {
    const result = await prisma.episode.createMany({
      data: episodeRows.slice(i, i + chunkSize).map(({ ep, episodeNumber, epAr }) => ({
        seasonId,
        episodeNumber,
        ...episodeFields(ep, epAr, imgBase),
      })),
      skipDuplicates: true,
    });
    insertedCount += result.count;
  }
  const numbers = episodeRows.map((row) => row.episodeNumber);
  const createdEpisodes = await prisma.episode.findMany({
    where: { seasonId, episodeNumber: { in: numbers } },
    select: { id: true, episodeNumber: true },
  });
  const byNumber = new Map(episodeRows.map((row) => [row.episodeNumber, row.ep]));
  for (let i = 0; i < createdEpisodes.length; i += chunkSize) {
    await prisma.episodeProvider.createMany({
      data: createdEpisodes.slice(i, i + chunkSize).map((episode) => ({
        episodeId: episode.id,
        providerId,
        externalId: `${showTmdbId}-S${canonicalSeasonNumber}E${byNumber.get(episode.episodeNumber)?.episode_number ?? episode.episodeNumber}`,
        sourceTitle: byNumber.get(episode.episodeNumber)?.name || null,
      })),
      skipDuplicates: true,
    });
  }
  return insertedCount;
}

// New and incomplete seasons only, then the current season. Existing episode rows are left intact
// (including hand-authored metadata), and genuinely new episode/provider links are inserted in
// batches. Custom layouts use their stored TMDB provider IDs to append new canonical episodes to
// the last custom part that contains that TMDB season, preserving all existing season assignments.
async function refreshEpisodesOnly(show, imgBase, providerId) {
  const data = await tmdbGet(`/tv/${show.tmdbId}`, { language: 'en-US' });
  const existing = await prisma.season.findMany({
    where: { showId: show.id },
    select: {
      id: true,
      seasonNumber: true,
      episodeCount: true,
      _count: { select: { episodes: true } },
    },
  });
  const byNumber = new Map(existing.map((s) => [s.seasonNumber, s]));
  const customEpisodes = show.seasonLayoutCustom
    ? await prisma.episodeProvider.findMany({
        where: {
          providerId,
          externalId: { startsWith: `${show.tmdbId}-S` },
          episode: { season: { showId: show.id } },
        },
        select: { externalId: true, episode: { select: { seasonId: true, episodeNumber: true, season: { select: { seasonNumber: true } } } } },
      })
    : [];
  const customByCanonical = new Map();
  const customCanonicalEpisodes = new Map();
  for (const link of customEpisodes) {
    const match = link.externalId?.match(new RegExp(`^${show.tmdbId}-S(\\d+)E(\\d+)$`));
    if (!match) continue;
    const canonicalSeason = Number(match[1]);
    const canonicalEpisode = Number(match[2]);
    if (!customCanonicalEpisodes.has(canonicalSeason)) customCanonicalEpisodes.set(canonicalSeason, new Set());
    customCanonicalEpisodes.get(canonicalSeason).add(canonicalEpisode);
    const previous = customByCanonical.get(canonicalSeason);
    const seasonNumber = link.episode.season.seasonNumber;
    if (!previous || seasonNumber > previous.seasonNumber) {
      customByCanonical.set(canonicalSeason, { seasonId: link.episode.seasonId, seasonNumber, episodeNumbers: new Set() });
    }
  }
  // Inspect every season summary. The season's own air_date can be empty or stale even when a
  // newly aired episode exists, so episode air dates are the import gate below. Complete old
  // seasons are skipped without an extra detail request; the current/latest one is always checked.
  const tmdbSeasons = (data.seasons ?? []).filter((s) => s.season_number >= 1);
  const latest = Math.max(0, ...tmdbSeasons.map((s) => s.season_number));
  let created = 0;
  let nextCustomSeasonNumber = Math.max(0, ...existing.map((s) => s.seasonNumber));
  for (const s of tmdbSeasons) {
    const own = byNumber.get(s.season_number);
    if (!show.seasonLayoutCustom && own && own._count.episodes >= (s.episode_count ?? 0) && s.season_number !== latest) continue;
    const customDestination = show.seasonLayoutCustom ? customByCanonical.get(s.season_number) : undefined;
    const knownCanonicalEpisodes = customCanonicalEpisodes.get(s.season_number) ?? new Set();
    if (customDestination && s.season_number !== latest && knownCanonicalEpisodes.size >= (s.episode_count ?? 0)) continue;
    const seasonData = await tmdbGet(`/tv/${show.tmdbId}/season/${s.season_number}`, { language: 'en-US' });
    let arByNumber = new Map();
    try {
      const ar = await tmdbGet(`/tv/${show.tmdbId}/season/${s.season_number}`, { language: 'ar' });
      arByNumber = new Map((ar.episodes ?? []).map((e) => [e.episode_number, e]));
    } catch {}
    const seasonFields = {
      name: seasonData.name || null,
      overview: seasonData.overview || null,
      poster: img(imgBase, 'w500', seasonData.poster_path),
      airDate: seasonData.air_date ? new Date(seasonData.air_date) : null,
      episodeCount: seasonData.episodes?.length ?? 0,
    };
    const aired = (seasonData.episodes ?? []).filter((ep) => importable(ep.air_date));
    if (!own && aired.length === 0) continue;
    if (!show.seasonLayoutCustom) {
      const season = await prisma.season.upsert({
        where: { showId_seasonNumber: { showId: show.id, seasonNumber: s.season_number } },
        create: { showId: show.id, seasonNumber: s.season_number, ...seasonFields },
        update: seasonFields,
      });
      const existingNumbers = new Set((await prisma.episode.findMany({
        where: { seasonId: season.id, episodeNumber: { in: aired.map((ep) => ep.episode_number) } },
        select: { episodeNumber: true },
      })).map((ep) => ep.episodeNumber));
      const missingRows = aired.filter((ep) => !existingNumbers.has(ep.episode_number)).map((ep) => ({
        ep,
        episodeNumber: ep.episode_number,
        epAr: arByNumber.get(ep.episode_number),
      }));
      created += await createMissingEpisodeBatch(season.id, missingRows, providerId, show.tmdbId, s.season_number, imgBase);
      continue;
    }

    let destination = customDestination;
    if (!destination) {
      nextCustomSeasonNumber += 1;
      const season = await prisma.season.create({
        data: {
          showId: show.id,
          seasonNumber: nextCustomSeasonNumber,
          ...seasonFields,
          episodeCount: 0,
        },
        select: { id: true, seasonNumber: true },
      });
      destination = { seasonId: season.id, seasonNumber: season.seasonNumber, episodeNumbers: new Set() };
      customByCanonical.set(s.season_number, destination);
    }
    const episodeMax = await prisma.episode.aggregate({
      where: { seasonId: destination.seasonId },
      _max: { episodeNumber: true },
    });
    let nextEpisodeNumber = episodeMax._max.episodeNumber ?? 0;
    const missingRows = aired.filter((ep) => !knownCanonicalEpisodes.has(ep.episode_number)).map((ep) => ({
      ep,
      episodeNumber: ++nextEpisodeNumber,
      epAr: arByNumber.get(ep.episode_number),
    }));
    const inserted = await createMissingEpisodeBatch(destination.seasonId, missingRows, providerId, show.tmdbId, s.season_number, imgBase);
    created += inserted;
    for (const row of missingRows) knownCanonicalEpisodes.add(row.ep.episode_number);
    customCanonicalEpisodes.set(s.season_number, knownCanonicalEpisodes);
    if (inserted) {
      await prisma.season.update({
        where: { id: destination.seasonId },
        data: { episodeCount: { increment: inserted } },
      });
    }
  }
  const showUpdate = {
    lastAirDate: data.last_air_date ? new Date(data.last_air_date) : null,
    updatedAt: new Date(),
  };
  if (show.seasonLayoutCustom) {
    const finalSeasons = await prisma.season.findMany({ where: { showId: show.id }, select: { _count: { select: { episodes: true } } } });
    await prisma.tVShow.update({
      where: { id: show.id },
      data: { ...showUpdate, numberOfSeasons: finalSeasons.length, numberOfEpisodes: finalSeasons.reduce((n, season) => n + season._count.episodes, 0) },
    });
  } else {
    await prisma.tVShow.update({
      where: { id: show.id },
      data: { ...showUpdate, numberOfSeasons: data.number_of_seasons ?? undefined, numberOfEpisodes: data.number_of_episodes ?? undefined },
    });
  }
  return created;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const emptyText = (field) => ({ OR: [{ [field]: null }, { [field]: '' }] });

const missingEpisodeFields = [
  ...emptyText('stillImage').OR,
  { runtime: null },
  { AND: [emptyText('overview'), emptyText('overviewAr')] },
  { AND: [{ OR: [{ title: '' }, { title: { startsWith: 'Episode ' } }] }, { titleAr: null }] },
];

async function backfillMissingPublishedMetadata(providerId, imgBase, budgetMs) {
  const cutoff = new Date(Date.now() - MISSING_METADATA_RETRY_DAYS * DAY_MS);
  const recent = { gte: new Date(Date.now() - MISSING_METADATA_RECENT_DAYS * DAY_MS) };
  const incompleteSeason = {
    updatedAt: { lt: cutoff },
    airDate: recent,
    OR: [{ name: null }, { overview: null }, { poster: null }],
  };
  const incompleteEpisode = {
    updatedAt: { lt: cutoff },
    airDate: recent,
    OR: missingEpisodeFields,
  };
  const started = Date.now();
  const seen = new Set();
  let checked = 0;
  let updatedEpisodes = 0;
  let updatedSeasons = 0;
  let errors = 0;

  while (Date.now() - started < budgetMs) {
  const shows = await prisma.tVShow.findMany({
    where: {
      id: { notIn: [...seen] },
      deletedAt: null,
      status: 'PUBLISHED',
      tmdbId: { not: null },
      seasons: {
        some: {
          OR: [
            incompleteSeason,
            { episodes: { some: incompleteEpisode } },
          ],
        },
      },
    },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      seasonLayoutCustom: true,
      seasons: {
        where: {
          OR: [
            incompleteSeason,
            { episodes: { some: incompleteEpisode } },
          ],
        },
        orderBy: { seasonNumber: 'asc' },
        select: {
          id: true,
          seasonNumber: true,
          name: true,
          overview: true,
          poster: true,
          updatedAt: true,
          episodes: {
            where: incompleteEpisode,
            orderBy: { episodeNumber: 'asc' },
            select: {
              id: true,
              episodeNumber: true,
              title: true,
              titleAr: true,
              overview: true,
              overviewAr: true,
              stillImage: true,
              runtime: true,
              updatedAt: true,
              providers: {
                where: { providerId },
                select: { externalId: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: 100,
  });
  if (shows.length === 0) break;

  for (const show of shows) {
    if (Date.now() - started >= budgetMs) break;
    seen.add(show.id);
    const staleSeasons = show.seasons.filter(
      (season) => season.updatedAt < cutoff && (!season.name || !season.overview || !season.poster),
    );
    const staleEpisodes = show.seasons.flatMap((season) =>
      season.episodes
        .map((episode) => ({ ...episode, seasonNumber: season.seasonNumber })),
    );
    if (!staleSeasons.length && !staleEpisodes.length) continue;

    checked++;
    const attemptedAt = new Date();
    try {
      const info = await tmdbGet(`/tv/${show.tmdbId}`, { language: 'en-US' });
      const tmdbSeasons = (info.seasons ?? [])
        .filter((season) => season.season_number > 0)
        .sort((a, b) => a.season_number - b.season_number);
      const episodeSources = new Map();
      const seasonSources = new Map();

      for (const season of show.seasons) {
        for (const episode of season.episodes) {
          let canonicalSeasonNumber = season.seasonNumber;
          let canonicalEpisodeNumber = episode.episodeNumber;
          if (show.seasonLayoutCustom) {
            const externalId = episode.providers[0]?.externalId;
            const match = externalId?.match(new RegExp(`^${show.tmdbId}-S(\\d+)E(\\d+)$`));
            if (!match) continue;
            canonicalSeasonNumber = Number(match[1]);
            canonicalEpisodeNumber = Number(match[2]);
          }
          episodeSources.set(episode.id, { canonicalSeasonNumber, canonicalEpisodeNumber });
          if (!seasonSources.has(season.seasonNumber)) {
            seasonSources.set(season.seasonNumber, canonicalSeasonNumber);
          }
        }
      }

      const neededSeasonNumbers = new Set();
      for (const source of episodeSources.values()) neededSeasonNumbers.add(source.canonicalSeasonNumber);
      for (const season of staleSeasons) {
        const canonicalSeasonNumber = show.seasonLayoutCustom
          ? seasonSources.get(season.seasonNumber)
          : season.seasonNumber;
        if (canonicalSeasonNumber) neededSeasonNumbers.add(canonicalSeasonNumber);
      }

      const tmdbBySeason = new Map();
      for (const canonicalSeasonNumber of neededSeasonNumbers) {
        const tmdbSeason = tmdbSeasons.find((season) => season.season_number === canonicalSeasonNumber);
        if (!tmdbSeason) continue;
        const english = await tmdbGet(`/tv/${show.tmdbId}/season/${canonicalSeasonNumber}`, {
          language: 'en-US',
        });
        let arabic = { episodes: [] };
        try {
          arabic = await tmdbGet(`/tv/${show.tmdbId}/season/${canonicalSeasonNumber}`, {
            language: 'ar',
          });
        } catch (error) {
          console.log(
            `  Arabic metadata unavailable for ${show.title} S${canonicalSeasonNumber}: ${error.message}`,
          );
        }
        const arabicByNumber = new Map((arabic.episodes ?? []).map((episode) => [episode.episode_number, episode]));
        tmdbBySeason.set(canonicalSeasonNumber, {
          data: english,
          episodes: new Map(
            (english.episodes ?? []).map((episode) => [
              episode.episode_number,
              { english: episode, arabic: arabicByNumber.get(episode.episode_number) },
            ]),
          ),
        });
      }

      for (const season of staleSeasons) {
        const canonicalSeasonNumber = show.seasonLayoutCustom
          ? seasonSources.get(season.seasonNumber)
          : season.seasonNumber;
        const source = canonicalSeasonNumber
          ? tmdbBySeason.get(canonicalSeasonNumber)?.data
          : undefined;
        const data = { updatedAt: attemptedAt };
        if (!season.name && source?.name) data.name = source.name;
        if (!season.overview && source?.overview) data.overview = source.overview;
        if (!season.poster && source?.poster_path) data.poster = img(imgBase, 'w500', source.poster_path);
        await prisma.season.update({ where: { id: season.id }, data });
        if (Object.keys(data).length > 1) updatedSeasons++;
      }

      // Whatever TMDB still lacks stays empty: updatedAt then holds the episode back until the next
      // retry, and nothing already stored is ever overwritten here.
      const unchanged = [];
      for (const episode of staleEpisodes) {
        const sourceKey = episodeSources.get(episode.id);
        const source = sourceKey
          ? tmdbBySeason.get(sourceKey.canonicalSeasonNumber)?.episodes.get(sourceKey.canonicalEpisodeNumber)
          : undefined;
        const data = {};
        if ((!hasText(episode.title) || /^Episode\s+\d+$/i.test(episode.title)) && source?.english.name) {
          data.title = source.english.name;
        }
        if (!episode.titleAr && source?.arabic?.name?.trim()) data.titleAr = source.arabic.name.trim();
        if (!hasText(episode.overview) && source?.english.overview) data.overview = source.english.overview;
        if (!episode.overviewAr && source?.arabic?.overview?.trim()) {
          data.overviewAr = source.arabic.overview.trim();
        }
        if (!episode.stillImage && source?.english.still_path) {
          data.stillImage = img(imgBase, 'w300', source.english.still_path);
        }
        if (!episode.runtime && source?.english.runtime) data.runtime = source.english.runtime;
        if (Object.keys(data).length === 0 || (Object.keys(data).length === 1 && data.title === episode.title)) {
          unchanged.push(episode.id);
          continue;
        }
        await prisma.episode.update({ where: { id: episode.id }, data: { ...data, updatedAt: attemptedAt } });
        updatedEpisodes++;
      }
      if (unchanged.length) {
        await prisma.episode.updateMany({ where: { id: { in: unchanged } }, data: { updatedAt: attemptedAt } });
      }
    } catch (error) {
      errors++;
      console.log(`  - Metadata backfill ${show.title}: ${error.message}`);
      await Promise.all([
        ...staleSeasons.map((season) =>
          prisma.season.update({ where: { id: season.id }, data: { updatedAt: attemptedAt } }),
        ),
        ...staleEpisodes.map((episode) =>
          prisma.episode.update({ where: { id: episode.id }, data: { updatedAt: attemptedAt } }),
        ),
      ]);
    }
  }
  }

  const stillMissing = await prisma.episode.count({
    where: {
      airDate: recent,
      OR: missingEpisodeFields,
      season: { show: { deletedAt: null, status: 'PUBLISHED', tmdbId: { not: null } } },
    },
  });
  return `metadata: ${checked} shows checked, ${updatedEpisodes} episodes and ${updatedSeasons} seasons filled, ` +
    `${stillMissing} episodes still marked incomplete, ${errors} errors`;
}

async function main() {
  const started = Date.now();
  const provider = await ensureImportProvider();
  const config = await tmdbGet('/configuration');
  const imgBase = config.images.secure_base_url;
  const metadataSummary = await backfillMissingPublishedMetadata(provider.id, imgBase, MISSING_METADATA_BUDGET_MS);
  const base = { deletedAt: null, status: 'PUBLISHED', tmdbId: { not: null } };
  const select = { id: true, tmdbId: true, title: true, seasonLayoutCustom: true };
  const shows = await connectWithRetry(() =>
    prisma.tVShow.findMany({ where: base, select, orderBy: { updatedAt: 'asc' } }),
  );
  console.log(`Refreshing all ${shows.length} published shows in least-recently-checked order...`);

  let done = 0;
  let newEpisodesTotal = 0;
  let errors = 0;
  let stoppedEarly = false;
  for (const show of shows) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    try {
      const created = await refreshEpisodesOnly(show, imgBase, provider.id);
      if (created) {
        newEpisodesTotal += created;
        console.log(`  + ${show.title}: ${created} new episode(s)`);
      }
    } catch (err) {
      errors++;
      console.log(`  - ${show.title}: ${err.message}`);
      // Moved to the back of the queue anyway, so one failing show can't hold the front forever.
      await prisma.tVShow.update({ where: { id: show.id }, data: { updatedAt: new Date() } }).catch(() => {});
    }
    done++;
  }

  const mins = Math.round((Date.now() - started) / 60000);
  console.log(
    `Done. ${done}/${shows.length} shows refreshed, ` +
      `${newEpisodesTotal} new episodes, ${errors} errors, ${mins} min` +
      (stoppedEarly ? ', time budget reached - the rest continue next run' : '') +
      `; ${metadataSummary}.`,
  );
}

main()
  .catch((error) => {
    console.error('Reimport failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
