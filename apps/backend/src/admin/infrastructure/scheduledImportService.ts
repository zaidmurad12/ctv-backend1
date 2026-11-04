import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prismaService.js';
import { TmdbImportService } from './tmdbImportService.js';
import { TmdbLookupService } from './tmdbLookupService.js';
import {
  SourceCatalogClient,
  type SourceCatalogEntry,
  type SourceStreamVariant,
} from './sourceCatalogClient.js';
import {
  extractImdbId,
  pickBestMatch,
  scoreMatch,
  MATCH_THRESHOLD,
  type TmdbCandidate,
} from './sourceTitleMatcher.js';

// `Number(x) || fallback` would silently discard an explicit "0" (falsy in JS) and use the
// fallback instead - this only treats a genuinely missing/invalid value as "unset", so a `0`
// override (e.g. to disable a pass entirely) actually takes effect.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const DAILY_QUOTA = envInt('SCHEDULED_IMPORT_DAILY_QUOTA', 50);
const UNMATCHED_RETRY_DAYS = envInt('SCHEDULED_IMPORT_UNMATCHED_RETRY_DAYS', 14);
const CRAWL_DELAY_MS = envInt('SCHEDULED_IMPORT_CRAWL_DELAY_MS', 300);
const SWEEP_MAX_PAGES = envInt('SCHEDULED_IMPORT_SWEEP_MAX_PAGES', 60);
// Movies that already play fine but have zero subtitles - see subtitleBackfill's own comment.
const SUBTITLE_BACKFILL_QUOTA = envInt('SCHEDULED_IMPORT_SUBTITLE_BACKFILL_QUOTA', 50);
const SUBTITLE_RETRY_DAYS = envInt('SCHEDULED_IMPORT_SUBTITLE_RETRY_DAYS', 7);
// Re-verifying already-active streams still resolve, and re-sourcing a movie that has none left -
// see healthCheck's own comment.
const HEALTHCHECK_QUOTA = envInt('SCHEDULED_IMPORT_HEALTHCHECK_QUOTA', 50);
const HEALTHCHECK_RETRY_DAYS = envInt('SCHEDULED_IMPORT_HEALTHCHECK_RETRY_DAYS', 7);
// Movies with no stream at all - does CEE/Cinemana have a match regardless? See
// sourceMatchCheck's own comment.
const SOURCE_MATCH_QUOTA = envInt('SCHEDULED_IMPORT_SOURCE_MATCH_QUOTA', 50);
const SOURCE_MATCH_RETRY_DAYS = envInt('SCHEDULED_IMPORT_SOURCE_MATCH_RETRY_DAYS', 7);
const PROBE_TIMEOUT_MS = 8000;
// The whole run happens inside one Cloud Run request (timeout 3600s) - stop well short of that so
// the HTTP call finishes cleanly; the cursor carries the rest to tomorrow.
const TIME_BUDGET_MS = envInt('SCHEDULED_IMPORT_TIME_BUDGET_MIN', 50) * 60 * 1000;
const IMPORT_CONCURRENCY = envInt('SCHEDULED_IMPORT_CONCURRENCY', 3);
const LATEST_WINDOW_DAYS = envInt('SCHEDULED_IMPORT_LATEST_WINDOW_DAYS', 90);
const LATEST_PAGES = envInt('SCHEDULED_IMPORT_LATEST_PAGES', 3);
const LATEST_PER_BUCKET = envInt('SCHEDULED_IMPORT_LATEST_PER_BUCKET', 40);
const TMDB_MAX_PAGE = 500;
// runNewestOnly - the several-times-a-day "just released" pass. See its own comment.
const NEWEST_WINDOW_DAYS = envInt('SCHEDULED_IMPORT_NEWEST_WINDOW_DAYS', 30);
const NEWEST_PAGES = envInt('SCHEDULED_IMPORT_NEWEST_PAGES', 2);
const NEWEST_PER_BUCKET = envInt('SCHEDULED_IMPORT_NEWEST_PER_BUCKET', 15);
const NEWEST_TIME_BUDGET_MS = envInt('SCHEDULED_IMPORT_NEWEST_TIME_BUDGET_MIN', 20) * 60 * 1000;

interface ImportBucket {
  name: string;
  languages: string;
  weight: number;
  minVotes: number;
}
// Arabic and Turkish weighted highest per explicit request, then English, then everything else.
// minVotes keeps zero-vote noise out; lower for ar since TMDB has far fewer votes on Arabic titles.
const IMPORT_BUCKETS: ImportBucket[] = [
  { name: 'ar', languages: 'ar', weight: 0.3, minVotes: 5 },
  { name: 'tr', languages: 'tr', weight: 0.25, minVotes: 20 },
  { name: 'en', languages: 'en', weight: 0.25, minVotes: 200 },
  {
    name: 'other',
    languages: 'fr|es|hi|ko|ja|ru|it|de|zh|pt|fa|ur|pl|nl|sv|th',
    weight: 0.2,
    minVotes: 100,
  },
];
const DAY_MS = 24 * 60 * 60 * 1000;

type Source = 'CEE' | 'CINEMANA';
type Kind = 'MOVIE' | 'SERIES';
type StreamField = 'movieProviderId' | 'episodeProviderId';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One row per (source, kind) sweep pass. Discovery sweeps a source's *entire* catalog via
// AdvancedSearch?videoTitle=&page=N (empty query = full browse, not search - see
// sourceCatalogClient.ts's own comment) rather than TMDB discover/popular, so every candidate the
// enrichment step below ever considers is guaranteed to already exist on that source - directly
// satisfies prioritizing published titles that actually have a stream+subtitle source.
type SourceCatalogItemRow = Awaited<
  ReturnType<PrismaService['client']['sourceCatalogItem']['findMany']>
>[number];

// Cloud Run scales this service to zero when idle, so - like CatalogRefreshService/
// TranslationBackfillService - this is triggered by Cloud Scheduler -> InternalController's HTTP
// endpoint, never an in-process @Cron timer.
//
// Two independent steps intentionally kept separate:
//  (a) discoverySweep - cheap, unbounded by the daily quota. Pages through both sources' full
//      catalogs (movies + series), recording every (source, nb) it's ever seen into
//      SourceCatalogItem as PENDING. Once a source+kind's pages run dry, its cursor's caughtUp
//      flips true and every future run just cheaply re-checks that same page for new arrivals.
//  (b) enrichment - the only part bounded by SCHEDULED_IMPORT_DAILY_QUOTA. Takes fresh PENDING
//      rows first, then due UNMATCHED retries to fill the rest of the quota (so a pile of retries
//      never crowds out that day's genuinely-new discoveries), resolves each one against TMDB,
//      imports metadata (if not already present) via the existing TmdbImportService, and attaches
//      this source's streams/subtitles.
//
// This split is *why* the job needs no explicit "backlog" vs "latest" mode flag: while PENDING
// rows vastly outnumber the daily quota (true for most of this feature's early life, given the
// two sources' combined ~20k-title catalogs), every day's quota goes entirely to backlog. Once
// both sources' sweeps catch up and the PENDING pool drains to near zero, the same enrichment
// step naturally has nothing left to do but the handful of genuinely-new titles each day's sweep
// finds - i.e. "latest releases only" - with no code path change.
@Injectable()
export class ScheduledImportService {
  private readonly logger = new Logger(ScheduledImportService.name);
  private running = false;
  private readonly clients: Record<Source, SourceCatalogClient>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tmdbImport: TmdbImportService,
    private readonly tmdbLookup: TmdbLookupService,
  ) {
    this.clients = {
      CEE: new SourceCatalogClient(
        process.env.SOURCE_CEE_BASE_URL ?? 'https://cee.buzz/api/android',
      ),
      CINEMANA: new SourceCatalogClient(
        process.env.PROVIDER_CINEMANA_BASE_URL ?? 'https://cinemana.shabakaty.com/api/android',
      ),
    };
  }

  async run(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'Previous scheduled import run is still in progress, skipping this trigger.',
      );
      return;
    }
    this.running = true;
    try {
      // TMDB-first popularity import, fully independent of CEE/Cinemana (per explicit request):
      // what gets imported no longer depends on those sources being reachable from Cloud Run
      // (they aren't - see below), and whether a title is actually playable is decided live by
      // the app itself on each viewer's device. The old source-catalog-driven discoverySweep/
      // enrichment/subtitleBackfill passes below are intentionally no longer invoked; they stay in
      // this file for when a working egress path to those sources exists again.
      await this.tmdbPopularImport();
      // healthCheck and sourceMatchCheck are DISABLED as of 2026-09-19: Cloud Run's outbound
      // fetch() to both cee.buzz and cinemana.shabakaty.com is failing entirely in production
      // ("fetch failed" on every call - confirmed via logs, while the same calls succeed fine from
      // a local machine, most likely those sources blocking Google Cloud's IP ranges). Neither of
      // these two passes tolerates that correctly: probeStreamUrl treats "couldn't reach the host
      // at all" identically to "this specific link is actually dead" and deactivates the Stream,
      // which then flips the movie to DRAFT via applyPublishPolicy - this silently drafted a batch
      // of genuinely-working, compatible titles. sourceMatchCheck has the same blind spot at one
      // remove (findSourceMatch's per-source catch swallows the network failure and just returns
      // "no match found" to the caller), so it was writing hasSourceMatch: false for titles that
      // do have a real match. Do not re-enable either call until the Cloud Run egress issue itself
      // is fixed and re-verified (e.g. a manual curl-equivalent fetch from the deployed service
      // actually reaching cee.buzz/cinemana.shabakaty.com) - otherwise every run just re-breaks
      // whatever the repair script fixed.
      // await this.healthCheck(providerIds);
      // await this.sourceMatchCheck();
    } finally {
      this.running = false;
    }
  }

  // Newest releases only, meant to run several times a day (Cloud Scheduler -> run-newest-import).
  // The full run() above only reaches recent titles twice a day, inside a 50-minute job, and its
  // "latest" pass requires a vote count a title released this week usually hasn't reached yet -
  // so brand-new releases could take days to show up. This pass looks only at what was released
  // in the last NEWEST_WINDOW_DAYS (up to today, never unreleased), most popular first, per
  // language bucket, and imports whatever isn't in the catalog yet. Already-imported titles are
  // skipped, so frequent runs are cheap and only ever add genuinely new arrivals. Shares the
  // `running` guard, so it never overlaps a full run().
  async runNewestOnly(budgetMs: number = NEWEST_TIME_BUDGET_MS): Promise<number> {
    if (this.running) {
      this.logger.warn(
        'Previous scheduled import run is still in progress, skipping newest-releases trigger.',
      );
      return 0;
    }
    this.running = true;
    try {
      const deadline = Date.now() + budgetMs;
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - NEWEST_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
      let total = 0;
      for (const kind of ['MOVIE', 'SERIES'] as Kind[]) {
        for (const bucket of IMPORT_BUCKETS) {
          if (Date.now() >= deadline) break;
          total += await this.importNewestPages(kind, bucket, from, to, deadline);
        }
      }
      this.logger.log(
        `Newest-releases import finished: ${total} new titles (released ${from}..${to}).`,
      );
      return total;
    } finally {
      this.running = false;
    }
  }

  private async importNewestPages(
    kind: Kind,
    bucket: ImportBucket,
    from: string,
    to: string,
    deadline: number,
  ): Promise<number> {
    const path = kind === 'MOVIE' ? '/discover/movie' : '/discover/tv';
    const dateKey = kind === 'MOVIE' ? 'primary_release_date' : 'first_air_date';
    // No vote floor for the core ar/tr audience (a title out this week often has none yet); a
    // minimal one elsewhere keeps zero-vote noise out of the much larger en/other pools.
    const minVotes = bucket.name === 'ar' || bucket.name === 'tr' ? 0 : 1;
    let imported = 0;
    for (
      let page = 1;
      page <= NEWEST_PAGES && imported < NEWEST_PER_BUCKET && Date.now() < deadline;
      page++
    ) {
      let found: {
        items: Array<{
          tmdbId: string;
          originalTitle?: string;
          date?: string;
          hasPoster: boolean;
          hasOverview: boolean;
          popularity: number;
          voteCount: number;
        }>;
        totalPages: number;
      };
      try {
        found = await this.tmdbLookup.fetchPage(
          path,
          {
            page,
            sort_by: 'popularity.desc',
            with_original_language: bucket.languages,
            [`${dateKey}.gte`]: from,
            [`${dateKey}.lte`]: to,
            'vote_count.gte': minVotes,
            include_adult: 'false',
            // Short films/clips (movies) and news, reality and talk shows (series) - never what
            // this catalog is for, and a big share of the zero-vote noise among new releases.
            ...(kind === 'MOVIE'
              ? { 'with_runtime.gte': 60 }
              : { without_genres: '10763|10764|10767' }),
          },
          kind === 'MOVIE' ? 'movie' : 'tv',
        );
      } catch (err) {
        this.logger.warn(
          `TMDB newest ${kind}/${bucket.name} page ${page} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return imported;
      }
      const ids = found.items.map((item) => item.tmdbId);
      if (ids.length === 0) break;
      const existing =
        kind === 'MOVIE'
          ? await this.prisma.client.movie.findMany({
              where: { tmdbId: { in: ids } },
              select: { tmdbId: true },
            })
          : await this.prisma.client.tVShow.findMany({
              where: { tmdbId: { in: ids } },
              select: { tmdbId: true },
            });
      const have = new Set(existing.map((row) => row.tmdbId));
      for (const item of found.items.filter((entry) => !have.has(entry.tmdbId))) {
        if (imported >= NEWEST_PER_BUCKET || Date.now() >= deadline) break;
        const tmdbId = item.tmdbId;
        if (!this.passesNewestQualityBar(bucket, item)) continue;
        if (await this.isDuplicateOfExisting(kind, item.originalTitle, item.date)) {
          this.logger.log(
            `Skipping ${kind} ${tmdbId} ("${item.originalTitle}"): same title and release date already in the catalog.`,
          );
          continue;
        }
        imported += 1;
        try {
          if (kind === 'MOVIE') await this.tmdbImport.importMovie(tmdbId);
          else await this.tmdbImport.importShow(tmdbId);
        } catch (err) {
          this.logger.warn(
            `TMDB newest import failed for ${kind} ${tmdbId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      if (page >= found.totalPages) break;
    }
    return imported;
  }

  // See InternalController.softDeleteTitles. Only touches rows not already deleted.
  async softDeleteTitles(
    movieIds: string[],
    showIds: string[],
  ): Promise<{ movies: number; shows: number }> {
    const now = new Date();
    const movies = movieIds.length
      ? (
          await this.prisma.client.movie.updateMany({
            where: { id: { in: movieIds }, deletedAt: null },
            data: { deletedAt: now },
          })
        ).count
      : 0;
    const shows = showIds.length
      ? (
          await this.prisma.client.tVShow.updateMany({
            where: { id: { in: showIds }, deletedAt: null },
            data: { deletedAt: now },
          })
        ).count
      : 0;
    this.logger.log(
      `Soft-deleted ${movies} movies and ${shows} shows: ${JSON.stringify({ movieIds, showIds })}`,
    );
    return { movies, shows };
  }

  // Arabic and Turkish new releases are imported with no vote floor (a title out this week often
  // has none yet), which let in junk and fake entries: pages with no poster, near-zero popularity
  // and nothing written about them, duplicate pages of a real title. Checked against a month of
  // real ar/tr releases on TMDB: genuine ones have a poster, popularity >= 1 and an overview or a
  // vote; the junk fails at least one. Other buckets already require a vote (see minVotes), so
  // only the poster is required of them here.
  private passesNewestQualityBar(
    bucket: ImportBucket,
    item: { hasPoster: boolean; hasOverview: boolean; popularity: number; voteCount: number },
  ): boolean {
    if (!item.hasPoster) return false;
    if (bucket.name !== 'ar' && bucket.name !== 'tr') return true;
    return item.popularity >= 1 && (item.hasOverview || item.voteCount >= 1);
  }

  // TMDB sometimes carries two entries for one release (a second, near-empty page someone added -
  // e.g. "Alikara"/"Alıkara", same network and air date, different TMDB ids), and both used to get
  // imported as separate titles. Most-popular-first ordering means the real entry is normally
  // imported first, so a later candidate with the same original title (case/accent-insensitive,
  // Turkish dotless ı folded) and the same release date is treated as that duplicate and skipped.
  private async isDuplicateOfExisting(
    kind: Kind,
    originalTitle?: string,
    date?: string,
  ): Promise<boolean> {
    if (!originalTitle || !date) return false;
    const releaseDate = new Date(date);
    if (Number.isNaN(releaseDate.getTime())) return false;
    const norm = (value?: string | null) =>
      (value ?? '')
        .toLowerCase()
        .replace(/ı/g, 'i')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^p{L}p{N}]+/gu, '');
    const target = norm(originalTitle);
    if (!target) return false;
    const where = { releaseDate, deletedAt: null };
    const select = { originalTitle: true, title: true };
    const sameDay =
      kind === 'MOVIE'
        ? await this.prisma.client.movie.findMany({ where, select })
        : await this.prisma.client.tVShow.findMany({ where, select });
    return sameDay.some((row) => norm(row.originalTitle) === target || norm(row.title) === target);
  }

  // A standalone trigger for just this one pass - sourceMatchCheck is the *last* step of the
  // full run() above, behind discoverySweep/enrichment/subtitleBackfill/healthCheck, all of which
  // can each run long on a real production catalog. An admin wanting to see the source-match
  // filter actually populated (rather than every row reading "not checked yet") shouldn't have to
  // wait for the whole daily pipeline first - this reuses the exact same `running` guard so it
  // never overlaps a full run() either way.
  async runSourceMatchCheckOnly(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'Previous scheduled import run is still in progress, skipping this trigger.',
      );
      return;
    }
    this.running = true;
    try {
      await this.sourceMatchCheck();
    } finally {
      this.running = false;
    }
  }

  // Upserted defensively every run rather than relying on boot-time registration (see
  // providerRegistryRepository.ts) - this job must keep working even if the SDK-based cinemana
  // provider row is disabled/misconfigured, since it never reads through that abstraction.
  private async ensureProviders(): Promise<Record<Source, string>> {
    const cee = await this.prisma.client.provider.upsert({
      where: { slug: 'cee' },
      create: {
        name: 'CEE',
        slug: 'cee',
        version: '1.0.0',
        baseUrl: process.env.SOURCE_CEE_BASE_URL ?? 'https://cee.buzz/api/android',
        isEnabled: true,
        healthStatus: 'HEALTHY',
      },
      update: {},
    });
    const cinemana = await this.prisma.client.provider.upsert({
      where: { slug: 'cinemana' },
      create: {
        name: 'Cinemana',
        slug: 'cinemana',
        version: '1.0.0',
        baseUrl:
          process.env.PROVIDER_CINEMANA_BASE_URL ?? 'https://cinemana.shabakaty.com/api/android',
        isEnabled: true,
        healthStatus: 'HEALTHY',
      },
      update: {},
    });
    return { CEE: cee.id, CINEMANA: cinemana.id };
  }

  // --- (0) TMDB-first popularity import ---------------------------------------------------------

  // Walks TMDB's own popularity-sorted /discover for movies AND series, split into language
  // buckets so Arabic and Turkish work (the audience's core catalog) is never crowded out by
  // whatever's globally most popular (English), while English and other languages still get their
  // share. Two passes per (kind, bucket): "latest" first (recent releases, so new arrivals always
  // make it in), then the popularity backlog from a persisted cursor, until DAILY_QUOTA (split by
  // bucket weight) or the time budget runs out. Titles already in the catalog are skipped, so
  // re-scanning is cheap and safe.
  private async tmdbPopularImport(): Promise<void> {
    const deadline = Date.now() + TIME_BUDGET_MS;
    const latestCutoff = new Date(Date.now() - LATEST_WINDOW_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const kinds: Kind[] = ['MOVIE', 'SERIES'];

    for (const kind of kinds) {
      for (const bucket of IMPORT_BUCKETS) {
        if (Date.now() >= deadline) return;
        await this.importPages(kind, bucket, {
          startPage: 1,
          maxPages: LATEST_PAGES,
          quota: LATEST_PER_BUCKET,
          minVotes: Math.max(1, Math.floor(bucket.minVotes / 10)),
          releasedAfter: latestCutoff,
          deadline,
        });
      }
    }

    for (const kind of kinds) {
      for (const bucket of IMPORT_BUCKETS) {
        if (Date.now() >= deadline) return;
        const quota = Math.max(1, Math.round((DAILY_QUOTA * bucket.weight) / kinds.length));
        const cursor = await this.prisma.client.tmdbDiscoveryCursor.upsert({
          where: { kind_bucket: { kind, bucket: bucket.name } },
          create: { kind, bucket: bucket.name },
          update: {},
        });
        const nextPage = await this.importPages(kind, bucket, {
          startPage: cursor.nextPage,
          maxPages: Number.MAX_SAFE_INTEGER,
          quota,
          minVotes: bucket.minVotes,
          deadline,
        });
        await this.prisma.client.tmdbDiscoveryCursor.update({
          where: { kind_bucket: { kind, bucket: bucket.name } },
          data: { nextPage },
        });
      }
    }
  }

  // Returns the page the next run should resume from (wraps to 1 past TMDB's page cap / an empty
  // page, so a later run re-scans and catches anything newly popular).
  private async importPages(
    kind: Kind,
    bucket: ImportBucket,
    opts: {
      startPage: number;
      maxPages: number;
      quota: number;
      minVotes: number;
      releasedAfter?: string;
      deadline: number;
    },
  ): Promise<number> {
    const type = kind === 'MOVIE' ? 'movie' : 'show';
    let imported = 0;
    let page = opts.startPage;
    for (
      let visited = 0;
      visited < opts.maxPages && imported < opts.quota && Date.now() < opts.deadline;
      visited++
    ) {
      // A saved cursor can land one past TMDB's hard page cap when a quota was filled exactly on
      // page 500. Reset before issuing the request; TMDB rejects page 501, and persisting that
      // failure as the next cursor would otherwise strand this language bucket on every run.
      if (page > TMDB_MAX_PAGE) page = 1;
      let found: { ids: string[]; totalPages: number };
      try {
        found = await this.tmdbLookup.discover(type, {
          page,
          languages: bucket.languages,
          minVotes: opts.minVotes,
          releasedAfter: opts.releasedAfter,
        });
      } catch (err) {
        this.logger.warn(
          `TMDB discover ${kind}/${bucket.name} page ${page} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return page;
      }
      if (found.ids.length === 0 || page >= Math.min(found.totalPages, TMDB_MAX_PAGE)) return 1;

      const existing =
        kind === 'MOVIE'
          ? await this.prisma.client.movie.findMany({
              where: { tmdbId: { in: found.ids } },
              select: { tmdbId: true },
            })
          : await this.prisma.client.tVShow.findMany({
              where: { tmdbId: { in: found.ids } },
              select: { tmdbId: true },
            });
      const have = new Set(existing.map((row) => row.tmdbId));
      const fresh = found.ids.filter((id) => !have.has(id));

      const queue = [...fresh];
      let consumedAll = true;
      const worker = async () => {
        while (queue.length > 0) {
          if (imported >= opts.quota || Date.now() >= opts.deadline) {
            consumedAll = false;
            return;
          }
          const tmdbId = queue.shift()!;
          imported += 1;
          try {
            if (kind === 'MOVIE') await this.tmdbImport.importMovie(tmdbId);
            else await this.tmdbImport.importShow(tmdbId);
          } catch (err) {
            this.logger.warn(
              `TMDB import failed for ${kind} ${tmdbId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      };
      await Promise.all(Array.from({ length: IMPORT_CONCURRENCY }, worker));
      if (!consumedAll || queue.length > 0) return page;
      page += 1;
    }
    return page;
  }

  // --- (a) Discovery sweep --------------------------------------------------------------------

  private async discoverySweep(providerIds: Record<Source, string>): Promise<void> {
    for (const source of ['CEE', 'CINEMANA'] as const) {
      for (const kind of ['MOVIE', 'SERIES'] as const) {
        await this.sweepOne(source, kind, providerIds[source]);
      }
    }
  }

  private async sweepOne(source: Source, kind: Kind, providerId: string): Promise<void> {
    const cursor = await this.prisma.client.sourceCatalogCursor.upsert({
      where: { source_kind: { source, kind } },
      create: { source, kind },
      update: {},
    });
    const client = this.clients[source];
    const browseType = kind === 'MOVIE' ? 'movie' : 'series';
    let page = cursor.nextPage;
    let caughtUp = cursor.caughtUp;
    let inserted = 0;
    let failed = 0;

    for (let pagesVisited = 0; pagesVisited < SWEEP_MAX_PAGES; pagesVisited++) {
      let entries: SourceCatalogEntry[];
      try {
        entries = await client.browse(browseType, page);
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `${source} ${kind} browse page ${page} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }
      if (entries.length === 0) {
        caughtUp = true;
        break;
      }
      caughtUp = false;
      for (const entry of entries) {
        if (entry.nb == null) continue;
        const nb = String(entry.nb);
        try {
          await this.prisma.client.sourceCatalogItem.upsert({
            where: { source_kind_nb: { source, kind, nb } },
            create: {
              source,
              kind,
              nb,
              enTitle: entry.en_title ?? null,
              arTitle: entry.ar_title ?? null,
              year: entry.year != null ? Number(entry.year) : null,
              imdbId: extractImdbId(entry.imdbUrlRef) ?? null,
            },
            // Never touch an existing row's status/attempts/nextRetryAt just because a later
            // sweep re-lists it - that would reset retry bookkeeping every single day.
            update: {},
          });
          inserted += 1;
        } catch (err) {
          this.logger.warn(
            `Failed to record ${source} ${kind} nb=${nb}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      page += 1;
      await sleep(CRAWL_DELAY_MS);
    }

    await this.prisma.client.sourceCatalogCursor.update({
      where: { source_kind: { source, kind } },
      data: { nextPage: page, caughtUp, lastSweptAt: new Date() },
    });
    await this.prisma.client.syncJob.create({
      data: {
        providerId,
        status: 'COMPLETED',
        startedAt: new Date(),
        finishedAt: new Date(),
        newMovies: inserted,
        failedMovies: failed,
      },
    });
  }

  // --- (b) Enrichment --------------------------------------------------------------------------

  private async enrichment(providerIds: Record<Source, string>): Promise<void> {
    const now = new Date();
    const pending = await this.prisma.client.sourceCatalogItem.findMany({
      where: { status: 'PENDING' },
      orderBy: { discoveredAt: 'asc' },
      take: DAILY_QUOTA,
    });
    const remaining = DAILY_QUOTA - pending.length;
    // Fresh discoveries always get first claim on the quota - see this file's own top comment on
    // why retries only fill whatever's left, not the other way around.
    const retries =
      remaining > 0
        ? await this.prisma.client.sourceCatalogItem.findMany({
            where: { status: 'UNMATCHED', nextRetryAt: { lte: now } },
            orderBy: { nextRetryAt: 'asc' },
            take: remaining,
          })
        : [];

    const counts: Record<Source, { processed: number; failed: number }> = {
      CEE: { processed: 0, failed: 0 },
      CINEMANA: { processed: 0, failed: 0 },
    };

    for (const item of [...pending, ...retries]) {
      try {
        await this.enrichOne(item, providerIds);
        counts[item.source as Source].processed += 1;
      } catch (err) {
        counts[item.source as Source].failed += 1;
        this.logger.warn(
          `Enrich failed for ${item.source} ${item.kind} nb=${item.nb}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const source of ['CEE', 'CINEMANA'] as const) {
      if (counts[source].processed === 0 && counts[source].failed === 0) continue;
      await this.prisma.client.importJob.create({
        data: {
          providerId: providerIds[source],
          status: 'COMPLETED',
          startedAt: now,
          finishedAt: new Date(),
          processed: counts[source].processed,
          failed: counts[source].failed,
        },
      });
    }
  }

  private async enrichOne(
    item: SourceCatalogItemRow,
    providerIds: Record<Source, string>,
  ): Promise<void> {
    const match = await this.matchTmdb(item);
    if (!match) {
      await this.prisma.client.sourceCatalogItem.update({
        where: { id: item.id },
        data: {
          status: 'UNMATCHED',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          nextRetryAt: new Date(Date.now() + UNMATCHED_RETRY_DAYS * DAY_MS),
        },
      });
      return;
    }

    const tmdbId = String(match.candidate.id);
    const kind = item.kind as Kind;
    const internalId =
      kind === 'MOVIE'
        ? await this.tmdbImport.importMovie(tmdbId)
        : await this.tmdbImport.importShow(tmdbId);

    const providerId = providerIds[item.source as Source];
    const client = this.clients[item.source as Source];
    if (kind === 'MOVIE') {
      await this.attachMovieSource(internalId, providerId, item.nb, client);
    } else {
      await this.attachShowSource(internalId, providerId, item.nb, client);
    }
    await this.applyPublishPolicy(kind, internalId);

    await this.prisma.client.sourceCatalogItem.update({
      where: { id: item.id },
      data: {
        status: 'MATCHED',
        matchMethod: match.method,
        matchScore: match.score,
        matchedMovieId: kind === 'MOVIE' ? internalId : null,
        matchedShowId: kind === 'SERIES' ? internalId : null,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        nextRetryAt: null,
      },
    });
  }

  // Exact TMDB find-by-imdb-id is the primary path (no scoring needed - an IMDb id match is
  // unambiguous). Fuzzy title+year similarity only runs when the source entry has no imdbUrlRef,
  // or that exact lookup comes back empty.
  private async matchTmdb(
    item: SourceCatalogItemRow,
  ): Promise<{ candidate: TmdbCandidate; score: number; method: 'imdb' | 'fuzzy' } | null> {
    const isMovie = item.kind === 'MOVIE';
    if (item.imdbId) {
      const found = await this.tmdbLookup.findByImdb(item.imdbId);
      const candidate = (isMovie ? found.movieResults : found.tvResults)[0];
      if (candidate) return { candidate, score: 100, method: 'imdb' };
    }
    const query = item.enTitle || item.arTitle;
    if (!query) return null;
    const candidates = await this.tmdbLookup.search(
      isMovie ? 'movie' : 'show',
      query,
      item.year ?? undefined,
    );
    const best = pickBestMatch(candidates, {
      en_title: item.enTitle ?? undefined,
      ar_title: item.arTitle ?? undefined,
      year: item.year ?? undefined,
    });
    return best ? { candidate: best.candidate, score: best.score, method: 'fuzzy' } : null;
  }

  private async attachMovieSource(
    movieId: string,
    providerId: string,
    nb: string,
    client: SourceCatalogClient,
  ): Promise<void> {
    const [streams, info] = await Promise.all([client.streams(nb), client.info(nb)]);
    const link = await this.prisma.client.movieProvider.upsert({
      where: { movieId_providerId: { movieId, providerId } },
      create: {
        movieId,
        providerId,
        externalId: nb,
        sourceTitle: info.en_title ?? info.ar_title ?? undefined,
      },
      update: { externalId: nb, sourceTitle: info.en_title ?? info.ar_title ?? undefined },
    });
    await this.reconcileStreams('movieProviderId', link.id, streams);
    await this.reconcileSubtitles('movieProviderId', link.id, info.translations ?? []);
  }

  // A show's own streams/subtitles hang off its individual episodes, never the TVShowProvider
  // link itself (same convention cinemanaBackfillService.ts already follows) - so this only
  // registers the show-level link for bookkeeping, then walks every matched (season, episode).
  private async attachShowSource(
    showId: string,
    providerId: string,
    nb: string,
    client: SourceCatalogClient,
  ): Promise<void> {
    await this.prisma.client.tVShowProvider.upsert({
      where: { showId_providerId: { showId, providerId } },
      create: { showId, providerId, externalId: nb },
      update: { externalId: nb },
    });

    const providerEpisodes = await client.episodes(nb);
    const episodeByKey = new Map<string, SourceCatalogEntry>();
    for (const entry of providerEpisodes) {
      if (entry.nb == null) continue;
      const season = entry.season != null ? Number(entry.season) : 1;
      const number = entry.episodeNummer != null ? Number(entry.episodeNummer) : 0;
      episodeByKey.set(`${season}:${number}`, entry);
    }
    if (episodeByKey.size === 0) return;

    const seasons = await this.prisma.client.season.findMany({
      where: { showId },
      include: { episodes: true },
    });
    for (const season of seasons) {
      for (const episode of season.episodes) {
        const entry = episodeByKey.get(`${season.seasonNumber}:${episode.episodeNumber}`);
        if (!entry || entry.nb == null) continue;
        const episodeNb = String(entry.nb);
        let streams: SourceStreamVariant[];
        try {
          streams = await client.streams(episodeNb);
        } catch {
          continue; // one bad episode link shouldn't abort the rest of the show
        }
        const link = await this.prisma.client.episodeProvider.upsert({
          where: { episodeId_providerId: { episodeId: episode.id, providerId } },
          create: {
            episodeId: episode.id,
            providerId,
            externalId: episodeNb,
            sourceTitle: entry.en_title ?? entry.ar_title ?? undefined,
          },
          update: {
            externalId: episodeNb,
            sourceTitle: entry.en_title ?? entry.ar_title ?? undefined,
          },
        });
        await this.reconcileStreams('episodeProviderId', link.id, streams);
        await this.reconcileSubtitles('episodeProviderId', link.id, entry.translations ?? []);
      }
    }
  }

  // Same dedup-by-streamUrl / deactivate-missing reconciliation as cinemanaBackfillService.ts's
  // own reconcileStreams - kept as a separate copy here rather than shared, since this one is
  // generalized over movieProviderId/episodeProviderId the same way that one already is, and
  // adding a subtitle counterpart (below) that file deliberately never needed.
  private async reconcileStreams(
    field: StreamField,
    linkId: string,
    incoming: SourceStreamVariant[],
  ): Promise<void> {
    const existing = await this.prisma.client.stream.findMany({ where: { [field]: linkId } });
    const incomingUrls = new Set<string>();
    let index = 0;
    for (const stream of incoming) {
      const url = stream.videoUrl || stream.url;
      if (!url) continue;
      incomingUrls.add(url);
      const data = {
        quality: stream.resolution || stream.name || 'unknown',
        serverName: stream.name ?? null,
        isDefault: index === 0,
        isActive: true,
      };
      const current = existing.find((row) => row.streamUrl === url);
      if (current) await this.prisma.client.stream.update({ where: { id: current.id }, data });
      else
        await this.prisma.client.stream.create({
          data: { [field]: linkId, streamUrl: url, ...data },
        });
      index += 1;
    }
    for (const row of existing) {
      if (row.isActive && !incomingUrls.has(row.streamUrl)) {
        await this.prisma.client.stream.update({
          where: { id: row.id },
          data: { isActive: false },
        });
      }
    }
  }

  // Unlike Stream, Subtitle has no isActive column (see schema.prisma) - so this only adds
  // tracks the source has that we don't already have (deduped by url), never deactivates one.
  // This is the auto-attach cinemanaBackfillService.ts explicitly opts out of ("only ever from an
  // admin's own deliberate action") - this job's entire point is doing exactly that unattended,
  // for cee/cinemana translations specifically.
  private async reconcileSubtitles(
    field: StreamField,
    linkId: string,
    incoming: Array<{ name?: string; file?: string; url?: string }>,
  ): Promise<void> {
    const existing = await this.prisma.client.subtitle.findMany({ where: { [field]: linkId } });
    let haveAny = existing.length > 0;
    for (const track of incoming) {
      const url = track.file || track.url;
      if (!url || existing.some((row) => row.url === url)) continue;
      const format = url.split('.').pop()?.toLowerCase().slice(0, 20) || 'srt';
      await this.prisma.client.subtitle.create({
        data: {
          [field]: linkId,
          language: track.name || 'unknown',
          format,
          url,
          isDefault: !haveAny,
        },
      });
      haveAny = true;
    }
  }

  // Formerly a "مسودة/منشور" policy that drafted a title when it had zero active streams at
  // enrichment time - retired 2026-09-19 per explicit instruction: publish everything this
  // pipeline touches unconditionally, and let the app's own live per-viewer compatibility check
  // (CinemanaTVRN's MovieDetailsScreen - it already does this exact CEE/Cinemana lookup itself
  // before rendering the Watch button) decide whether to show a working play button. That check
  // runs from the viewer's own device, which can actually reach these sources - unlike Cloud Run
  // (see this file's disabled healthCheck/sourceMatchCheck above), so it was always the more
  // reliable signal; DRAFT-gating on top of it in the catalog was redundant at best and actively
  // wrong while Cloud Run's egress to these sources stays broken.
  private async applyPublishPolicy(kind: Kind, internalId: string): Promise<void> {
    if (kind === 'MOVIE') {
      await this.prisma.client.movie.update({
        where: { id: internalId },
        data: { status: 'PUBLISHED' },
      });
    } else {
      await this.prisma.client.tVShow.update({
        where: { id: internalId },
        data: { status: 'PUBLISHED' },
      });
    }
  }

  // --- (c) Subtitle backfill for movies that already play fine ---------------------------------

  // Targets movies that are PUBLISHED, have at least one working (isActive) stream from any
  // provider, but have zero Subtitle rows anywhere - the "has a link, missing translations" case.
  // Unlike (b) above, this runs regardless of whether the movie came from this pipeline, an
  // earlier TMDB-discover admin import, or manual entry - subtitleBackfillCheckedAt (see its own
  // schema comment) is what keeps this from re-searching the same not-found title every run.
  // Streams are deliberately left untouched here - this only ever adds subtitles, never re-sources
  // or replaces an already-working stream (see healthCheck below for the dead-link case).
  private async subtitleBackfill(providerIds: Record<Source, string>): Promise<void> {
    const cutoff = new Date(Date.now() - SUBTITLE_RETRY_DAYS * DAY_MS);
    const candidates = await this.prisma.client.movie.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        AND: [
          { providers: { some: { streams: { some: { isActive: true } } } } },
          { providers: { every: { subtitles: { none: {} } } } },
        ],
        OR: [{ subtitleBackfillCheckedAt: null }, { subtitleBackfillCheckedAt: { lt: cutoff } }],
      },
      select: { id: true, title: true, originalTitle: true, imdbId: true, releaseDate: true },
      orderBy: { subtitleBackfillCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: SUBTITLE_BACKFILL_QUOTA,
    });

    for (const movie of candidates) {
      try {
        const match = await this.findSourceMatch(
          'MOVIE',
          movie.title,
          movie.originalTitle,
          movie.releaseDate?.getUTCFullYear() ?? null,
          movie.imdbId,
        );
        if (match) {
          const client = this.clients[match.source];
          const info = await client.info(match.nb);
          if (info.translations?.length) {
            const link = await this.prisma.client.movieProvider.upsert({
              where: {
                movieId_providerId: { movieId: movie.id, providerId: providerIds[match.source] },
              },
              create: {
                movieId: movie.id,
                providerId: providerIds[match.source],
                externalId: match.nb,
                sourceTitle: info.en_title ?? info.ar_title ?? undefined,
              },
              update: {
                externalId: match.nb,
                sourceTitle: info.en_title ?? info.ar_title ?? undefined,
              },
            });
            await this.reconcileSubtitles('movieProviderId', link.id, info.translations);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Subtitle backfill failed for movie ${movie.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await this.prisma.client.movie.update({
        where: { id: movie.id },
        data: { subtitleBackfillCheckedAt: new Date() },
      });
    }
  }

  // --- (d) Dead-link health check + re-sourcing -------------------------------------------------

  // Re-probes every currently-active Stream URL on a rotating subset of movies each run
  // (streamHealthCheckedAt-ordered, same oldest-first idea as subtitleBackfill above). A probe
  // that fails deactivates that Stream row - if that leaves a movie with zero active streams left
  // at all, this re-runs the same source-search-and-attach path enrichment uses to find a fresh
  // link, then reapplies the DRAFT/PUBLISHED policy so a movie whose only link died and couldn't
  // be replaced disappears from the public catalog instead of sitting there un-playable.
  private async healthCheck(providerIds: Record<Source, string>): Promise<void> {
    const cutoff = new Date(Date.now() - HEALTHCHECK_RETRY_DAYS * DAY_MS);
    const candidates = await this.prisma.client.movie.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        providers: { some: { streams: { some: { isActive: true } } } },
        OR: [{ streamHealthCheckedAt: null }, { streamHealthCheckedAt: { lt: cutoff } }],
      },
      select: {
        id: true,
        title: true,
        originalTitle: true,
        imdbId: true,
        releaseDate: true,
        providers: {
          select: { streams: { where: { isActive: true }, select: { id: true, streamUrl: true } } },
        },
      },
      orderBy: { streamHealthCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: HEALTHCHECK_QUOTA,
    });

    for (const movie of candidates) {
      try {
        let anyDeactivated = false;
        for (const providerLink of movie.providers) {
          for (const stream of providerLink.streams) {
            const alive = await this.probeStreamUrl(stream.streamUrl);
            if (!alive) {
              await this.prisma.client.stream.update({
                where: { id: stream.id },
                data: { isActive: false },
              });
              anyDeactivated = true;
            }
          }
        }
        if (anyDeactivated) {
          const remainingActive = await this.prisma.client.stream.count({
            where: { movieProvider: { movieId: movie.id }, isActive: true },
          });
          if (remainingActive === 0) {
            const match = await this.findSourceMatch(
              'MOVIE',
              movie.title,
              movie.originalTitle,
              movie.releaseDate?.getUTCFullYear() ?? null,
              movie.imdbId,
            );
            if (match) {
              await this.attachMovieSource(
                movie.id,
                providerIds[match.source],
                match.nb,
                this.clients[match.source],
              );
            }
          }
          await this.applyPublishPolicy('MOVIE', movie.id);
        }
      } catch (err) {
        this.logger.warn(
          `Health check failed for movie ${movie.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await this.prisma.client.movie.update({
        where: { id: movie.id },
        data: { streamHealthCheckedAt: new Date() },
      });
    }
  }

  // --- (e) Source-match check for streamless movies ---------------------------------------------

  // CinemanaTVRN's own MovieDetailsScreen does this exact same catalog-to-source search live,
  // client-side, every time a viewer opens a movie with no stored stream - to decide whether the
  // Watch button should even render (a real source match still plays fine on the spot, even
  // though nothing's ever been pulled into a stored Stream row for it). This mirrors that check
  // server-side and caches the result, purely so the admin list can show the same signal without
  // making every admin's page load do a live CEE/Cinemana search per row. Deliberately never
  // flips hasPlayableStream/status itself - a confirmed source match doesn't mean this pipeline
  // has actually attached anything yet, just that the app's own live fallback can.
  private async sourceMatchCheck(): Promise<void> {
    const cutoff = new Date(Date.now() - SOURCE_MATCH_RETRY_DAYS * DAY_MS);
    const candidates = await this.prisma.client.movie.findMany({
      where: {
        deletedAt: null,
        NOT: { providers: { some: { streams: { some: { isActive: true } } } } },
        OR: [{ sourceMatchCheckedAt: null }, { sourceMatchCheckedAt: { lt: cutoff } }],
      },
      select: { id: true, title: true, originalTitle: true, imdbId: true, releaseDate: true },
      orderBy: { sourceMatchCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: SOURCE_MATCH_QUOTA,
    });

    for (const movie of candidates) {
      // A search failure (network blip, source down) genuinely means "unknown", not "no match" -
      // only a real completed search is allowed to write hasSourceMatch itself. checkedAt still
      // advances either way (same as subtitleBackfill/healthCheck above), so a persistently
      // failing title doesn't get retried every single run either.
      let hasMatch: boolean | undefined;
      try {
        const match = await this.findSourceMatch(
          'MOVIE',
          movie.title,
          movie.originalTitle,
          movie.releaseDate?.getUTCFullYear() ?? null,
          movie.imdbId,
        );
        hasMatch = !!match;
      } catch (err) {
        this.logger.warn(
          `Source match check failed for movie ${movie.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await this.prisma.client.movie.update({
        where: { id: movie.id },
        data: {
          ...(hasMatch !== undefined ? { hasSourceMatch: hasMatch } : {}),
          sourceMatchCheckedAt: new Date(),
        },
      });
    }
  }

  // A cheap reachability check - a 2-byte ranged GET, not a real download (same idea as
  // CinemanaTVRN/src/streamSelect.ts's own probeServer on the client side).
  private async probeStreamUrl(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-1' },
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  // The catalog-to-source direction: given one of our own movies, search both sources by title
  // and return the single best match across both (exact IMDb match short-circuits immediately;
  // otherwise the highest fuzzy score at or above MATCH_THRESHOLD wins). This is the reverse of
  // matchTmdb above (which starts from a source listing and resolves it to TMDB) - used only by
  // subtitleBackfill/healthCheck, which start from a movie we already have.
  private async findSourceMatch(
    kind: Kind,
    title: string,
    originalTitle: string | null,
    year: number | null,
    imdbId: string | null,
  ): Promise<{ source: Source; nb: string } | null> {
    const type = kind === 'MOVIE' ? 'movie' : 'series';
    const candidate: TmdbCandidate = {
      id: 0,
      title,
      original_title: originalTitle ?? undefined,
      release_date: year ? `${year}-01-01` : undefined,
    };
    let best: { source: Source; nb: string; score: number } | null = null;
    for (const source of ['CEE', 'CINEMANA'] as const) {
      let results: SourceCatalogEntry[];
      try {
        results = await this.clients[source].search(type, title);
      } catch {
        continue;
      }
      for (const entry of results) {
        if (entry.nb == null) continue;
        if (imdbId && extractImdbId(entry.imdbUrlRef) === imdbId) {
          return { source, nb: String(entry.nb) };
        }
        const score = scoreMatch(candidate, entry);
        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
          best = { source, nb: String(entry.nb), score };
        }
      }
    }
    return best;
  }
}
