import { Body, Controller, Get, HttpCode, Injectable, Logger, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { Public, Roles } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';
import { TmdbImportService } from './infrastructure/tmdbImportService.js';
import { TmdbLookupService } from './infrastructure/tmdbLookupService.js';

// The sources' own "newly added" lists (Cinemana latestMovies/latestSeries - a handful of films and
// series a day). The sources only answer from inside Iraq, so the TV app fetches them there and
// posts them here; this server marks the titles we already have as compatible (publishing drafts),
// and imports from TMDB, by IMDb id, the ones we don't have yet.

// The admin's "import from the sources" page: at most one source page (24 titles) per request.
const ADMIN_IMPORT_PER_CALL_LIMIT = 24;

export class LatestSourceItem {
  @IsString()
  @MaxLength(20)
  nb!: string;

  @IsIn(['movie', 'series'])
  kind!: 'movie' | 'series';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  enTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  arTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  year?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ref?: string;

  // Which source's list the title came from. TVs before v224 only sent Cinemana's and left it out.
  @IsOptional()
  @IsIn(['cinemana', 'cee'])
  source?: 'cinemana' | 'cee';
}

export class SourceImportItem extends LatestSourceItem {
  @IsIn(['cinemana', 'cee'])
  source!: 'cinemana' | 'cee';
}

export class SourceImportBody {
  @IsArray()
  @ArrayMaxSize(ADMIN_IMPORT_PER_CALL_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => SourceImportItem)
  items!: SourceImportItem[];

  // Only report what each title is in the app now - change nothing.
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export type SourceImportState =
  | 'published' // in the app, compatible and live - nothing to do
  | 'hidden' // in the catalog but not live or not marked compatible
  | 'missing' // not in the catalog
  | 'activated' // was hidden, now live and compatible
  | 'imported' // was missing, imported from TMDB
  | 'no-match' // not found on TMDB by its IMDb link or exact title + year
  | 'db-full' // the free database is near its cap - nothing imported
  | 'error';

export interface SourceImportResult {
  source: 'cinemana' | 'cee';
  nb: string;
  state: SourceImportState;
  id?: string;
  title?: string;
  message?: string;
}

export class LatestSourceBody {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LatestSourceItem)
  items!: LatestSourceItem[];
}

const IMPORTS_PER_DAY = 60;
// The admin's "import from the sources" page: nothing is imported once the free database passes
// this size.
const DB_STOP_MB = Number(process.env.DB_STOP_MB) || 850;
const IMPORTS_PER_CALL = 8;
const CALL_BUDGET_MS = 200_000;
const RETRY_UNMATCHED_MS = 3 * 24 * 3600_000;
// Titles reported before the title search existed and left out for having no IMDb link (or no TMDB
// entry for it) - the TVs won't send them again, so each call retries a few of them itself.
const BACKLOG_PER_CALL = 3;
const OLD_MISSES = ['tv-noref', 'tv-notmdb'];

type SourceKey = 'CINEMANA' | 'CEE';
const sourceKeyOf = (item: LatestSourceItem): SourceKey =>
  item.source === 'cee' ? 'CEE' : 'CINEMANA';
// The id a TV remembers a title by: Cinemana's number alone (as before v224), "cee:<nb>" for CEE -
// the two sources number their titles independently.
const doneKeyOf = (item: LatestSourceItem): string =>
  item.source === 'cee' ? `cee:${item.nb}` : item.nb;

function imdbOf(ref?: string): string | null {
  const m = /(tt\d{6,10})/i.exec(ref ?? '');
  return m ? m[1]!.toLowerCase() : null;
}

function norm(text?: string | null): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

@Injectable()
export class SourceLatestService {
  private readonly prisma: PrismaDatabaseClient;
  private readonly logger = new Logger('SourceLatest');
  // nb -> when it was handled; many TVs send the same list, each item is only worked on once a day.
  private readonly seen = new Map<string, number>();
  private importDay = '';
  private importsToday = 0;

  constructor(
    prismaService: PrismaService,
    private readonly importer: TmdbImportService,
    private readonly lookup: TmdbLookupService,
  ) {
    this.prisma = prismaService.client;
  }

  // Titles already handled in an earlier call (any TV, any day, even after the free host slept and
  // forgot its memory): linked to a catalog title, or looked up without success in the last 3 days.
  private async alreadyHandled(items: LatestSourceItem[]): Promise<Set<string>> {
    const nbs = [...new Set(items.map((i) => i.nb).filter((nb) => /^\d+$/.test(nb)))];
    const done = new Set<string>();
    if (!nbs.length) return done;
    const retryAfter = new Date(Date.now() - RETRY_UNMATCHED_MS);
    const rows = await this.prisma.sourceCatalogItem.findMany({
      where: { source: { in: ['CINEMANA', 'CEE'] }, nb: { in: nbs } },
      select: {
        source: true,
        kind: true,
        nb: true,
        status: true,
        matchMethod: true,
        lastAttemptAt: true,
      },
    });
    for (const row of rows) {
      const recentMiss =
        row.status === 'UNMATCHED' &&
        !!row.matchMethod?.startsWith('tv-') &&
        row.lastAttemptAt != null &&
        row.lastAttemptAt > retryAfter;
      if (row.status === 'MATCHED' || recentMiss) {
        done.add(`${row.source}:${row.kind === 'SERIES' ? 'series' : 'movie'}:${row.nb}`);
      }
    }
    return done;
  }

  // `done` lists the source numbers that need no further sending (handled now or earlier); the TV
  // remembers them and sends only the rest next time. Titles left out because of the per-call or
  // per-day import caps are not in it, so they are sent again later.
  // `admin`: the admin panel's "check the newest now" button - no per-call / per-day import caps
  // (only the database size guard), and titles a TV handled in the last day are looked at again.
  async ingest(
    body: LatestSourceBody,
    options: { admin?: boolean } = {},
  ): Promise<{
    matched: number;
    imported: number;
    skipped: number;
    noMatch: number;
    dbFull: boolean;
    done: string[];
  }> {
    const admin = options.admin === true;
    const started = Date.now();
    const now = Date.now();
    for (const [nb, at] of this.seen) if (now - at > 24 * 3600_000) this.seen.delete(nb);
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.importDay) {
      this.importDay = today;
      this.importsToday = 0;
    }
    const dbSizeMb = await this.databaseSizeMb();
    const dbFull = dbSizeMb !== null && dbSizeMb >= DB_STOP_MB;

    let matched = 0;
    let imported = 0;
    let skipped = 0;
    let noMatch = 0;
    let importsThisCall = 0;
    const handled = await this.alreadyHandled(body.items);
    const done = new Set<string>();
    for (const item of body.items) {
      const key = doneKeyOf(item);
      if (
        !/^\d+$/.test(item.nb) ||
        (!admin && this.seen.has(key)) ||
        handled.has(`${sourceKeyOf(item)}:${item.kind}:${item.nb}`)
      ) {
        skipped++;
        done.add(key);
        continue;
      }
      if (Date.now() - started > CALL_BUDGET_MS) break;
      const kind = item.kind === 'series' ? 'show' : 'movie';
      try {
        const found = await this.findExisting(kind, item);
        if (found) {
          await this.markCompatible(kind, found.id, false);
          await this.record(item, kind, 'MATCHED', found.method, found.id, sourceKeyOf(item));
          matched++;
          done.add(key);
          this.seen.set(key, now);
          continue;
        }
        // Left for a later call (not in `done`, so the TV sends it again) once the caps are reached.
        const capped =
          !admin && (importsThisCall >= IMPORTS_PER_CALL || this.importsToday >= IMPORTS_PER_DAY);
        if (capped || dbFull) {
          skipped++;
          continue;
        }
        this.seen.set(key, now);
        const result = await this.importFromTmdb(kind, item);
        if (result === 'no-match') {
          done.add(key);
          noMatch++;
          continue;
        }
        importsThisCall++;
        imported++;
        done.add(key);
      } catch (err) {
        skipped++;
        this.logger.warn(
          `item ${item.nb} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // Spare room in this call goes to titles left out before the title search existed.
    if (!admin && !dbFull && Date.now() - started < CALL_BUDGET_MS / 2) {
      const backlog = await this.prisma.sourceCatalogItem.findMany({
        where: { source: 'CINEMANA', status: 'UNMATCHED', matchMethod: { in: OLD_MISSES } },
        orderBy: { lastAttemptAt: 'asc' },
        take: Math.max(0, Math.min(BACKLOG_PER_CALL, IMPORTS_PER_CALL - importsThisCall)),
      });
      for (const row of backlog) {
        if (this.importsToday >= IMPORTS_PER_DAY || Date.now() - started > CALL_BUDGET_MS) break;
        const item: LatestSourceItem = {
          nb: row.nb,
          kind: row.kind === 'SERIES' ? 'series' : 'movie',
          enTitle: row.enTitle ?? undefined,
          arTitle: row.arTitle ?? undefined,
          year: row.year != null ? String(row.year) : undefined,
          ref: row.imdbId ?? undefined,
          source: 'cinemana',
        };
        const kind = item.kind === 'series' ? 'show' : 'movie';
        try {
          const existing = await this.findExisting(kind, item);
          if (existing) {
            await this.markCompatible(kind, existing.id, false);
            await this.record(item, kind, 'MATCHED', existing.method, existing.id);
            matched++;
          } else if ((await this.importFromTmdb(kind, item)) === 'imported') {
            importsThisCall++;
            imported++;
          }
        } catch (err) {
          this.logger.warn(
            `backlog ${row.nb} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          // Moved to the back of the backlog either way.
          await this.record(item, kind, 'UNMATCHED', 'tv-notitle', null);
        }
      }
    }
    return { matched, imported, skipped, noMatch, dbFull, done: [...done] };
  }

  // The admin's "import from the sources" page (run from a browser in Iraq, which lists or searches
  // the sources and sends what it finds here). For each title: already in the app -> reported;
  // in the catalog but hidden -> marked compatible and published; missing -> imported from TMDB
  // (by IMDb link, else exact title + year), whatever its age. Either way the title is pinned to the
  // exact source entry it came from, so it plays at once. dryRun only reports.
  async adminImport(
    body: SourceImportBody,
  ): Promise<{ results: SourceImportResult[]; dbSizeMb: number | null }> {
    let dbSizeMb = await this.databaseSizeMb();
    const results: SourceImportResult[] = [];
    for (const item of body.items) {
      const kind = item.kind === 'series' ? 'show' : 'movie';
      const base = { source: item.source, nb: item.nb };
      const sourceKey = item.source === 'cee' ? ('CEE' as const) : ('CINEMANA' as const);
      try {
        const existing = await this.findExisting(kind, item);
        if (existing) {
          const row =
            kind === 'movie'
              ? await this.prisma.movie.findUnique({
                  where: { id: existing.id },
                  select: { title: true, titleAr: true, status: true, hasSourceMatch: true },
                })
              : await this.prisma.tVShow.findUnique({
                  where: { id: existing.id },
                  select: { title: true, titleAr: true, status: true, hasSourceMatch: true },
                });
          const title = row?.titleAr || row?.title;
          const live = row?.status === 'PUBLISHED' && row.hasSourceMatch === true;
          if (body.dryRun || live) {
            results.push({ ...base, state: live ? 'published' : 'hidden', id: existing.id, title });
            continue;
          }
          await this.markCompatible(kind, existing.id, true);
          await this.pinSource(kind, existing.id, item);
          await this.publish(kind, existing.id);
          await this.record(item, kind, 'MATCHED', 'adm-match', existing.id, sourceKey);
          results.push({ ...base, state: 'activated', id: existing.id, title });
          continue;
        }
        if (body.dryRun) {
          results.push({ ...base, state: 'missing' });
          continue;
        }
        if (dbSizeMb !== null && dbSizeMb >= DB_STOP_MB) {
          results.push({ ...base, state: 'db-full' });
          continue;
        }
        const imdb = imdbOf(item.ref);
        const tmdbId = imdb
          ? ((await this.tmdbIdFor(kind, imdb)) ?? (await this.tmdbIdByTitle(kind, item)))
          : await this.tmdbIdByTitle(kind, item);
        if (!tmdbId) {
          await this.record(item, kind, 'UNMATCHED', 'adm-none', null, sourceKey);
          results.push({ ...base, state: 'no-match' });
          continue;
        }
        const id =
          kind === 'movie'
            ? await this.importer.importMovie(tmdbId)
            : await this.importer.importShow(tmdbId);
        await this.markCompatible(kind, id, true);
        await this.pinSource(kind, id, item);
        await this.publish(kind, id);
        await this.record(item, kind, 'MATCHED', 'adm-import', id, sourceKey);
        const row =
          kind === 'movie'
            ? await this.prisma.movie.findUnique({
                where: { id },
                select: { title: true, titleAr: true },
              })
            : await this.prisma.tVShow.findUnique({
                where: { id },
                select: { title: true, titleAr: true },
              });
        results.push({ ...base, state: 'imported', id, title: row?.titleAr || row?.title });
        dbSizeMb = await this.databaseSizeMb();
      } catch (err) {
        results.push({
          ...base,
          state: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { results, dbSizeMb };
  }

  // Links the title to the source entry it was found under (the same pin the admin's source picker
  // sets), unless it already has one - so it plays without depending on the app's title matching.
  private async pinSource(
    kind: 'movie' | 'show',
    id: string,
    item: SourceImportItem,
  ): Promise<void> {
    const link = [{ source: item.source, nb: item.nb, kind: item.kind }];
    const row =
      kind === 'movie'
        ? await this.prisma.movie.findUnique({ where: { id }, select: { sourceLinks: true } })
        : await this.prisma.tVShow.findUnique({ where: { id }, select: { sourceLinks: true } });
    if (Array.isArray(row?.sourceLinks) && row.sourceLinks.length > 0) return;
    if (kind === 'movie')
      await this.prisma.movie.update({ where: { id }, data: { sourceLinks: link } });
    else await this.prisma.tVShow.update({ where: { id }, data: { sourceLinks: link } });
  }

  // Any status other than live (draft, pending, inactive) - the admin asked for this title to show.
  private async publish(kind: 'movie' | 'show', id: string): Promise<void> {
    const where = { id, status: { not: 'PUBLISHED' as const } };
    const data = { status: 'PUBLISHED' as const };
    if (kind === 'movie') await this.prisma.movie.updateMany({ where, data });
    else await this.prisma.tVShow.updateMany({ where, data });
  }

  private async databaseSizeMb(): Promise<number | null> {
    try {
      const rows = (await this.prisma
        .$queryRaw`select (pg_database_size(current_database()) / 1048576)::int as mb`) as Array<{
        mb: number;
      }>;
      return Number(rows[0]?.mb ?? 0) || null;
    } catch {
      return null;
    }
  }

  // Finds the title on TMDB - by its IMDb link when the source gives one, otherwise by the source's
  // own title and year - and imports it, whatever its age. 'no-match' is recorded so it isn't
  // searched again for a few days.
  private async importFromTmdb(
    kind: 'movie' | 'show',
    item: LatestSourceItem,
  ): Promise<'imported' | 'no-match'> {
    const imdb = imdbOf(item.ref);
    const tmdbId = imdb
      ? ((await this.tmdbIdFor(kind, imdb)) ?? (await this.tmdbIdByTitle(kind, item)))
      : await this.tmdbIdByTitle(kind, item);
    if (!tmdbId) {
      await this.record(item, kind, 'UNMATCHED', 'tv-notitle', null);
      return 'no-match';
    }
    this.importsToday++;
    const id =
      kind === 'movie'
        ? await this.importer.importMovie(tmdbId)
        : await this.importer.importShow(tmdbId);
    await this.markCompatible(kind, id, true);
    await this.record(item, kind, 'MATCHED', 'tv-import', id);
    this.logger.log(`imported ${kind} tmdb ${tmdbId} (source nb ${item.nb}) -> ${id}`);
    return 'imported';
  }

  // No IMDb link (common for older and Arabic titles): TMDB is searched with the source's English,
  // then Arabic title, and only an exact title match (TMDB's title or original title - an Arabic
  // film's original title is its Arabic one) within a year of the source's year is taken. A near
  // miss would import a different film, so it isn't.
  private async tmdbIdByTitle(
    kind: 'movie' | 'show',
    item: LatestSourceItem,
  ): Promise<string | null> {
    const year = Number(item.year) || undefined;
    const queries = [item.enTitle, item.arTitle]
      .map((t) => (t ?? '').trim())
      .filter((t) => t.length >= 2);
    const wanted = new Set(queries.map(norm));
    if (!wanted.size) return null;
    for (const query of queries) {
      // TMDB's own year filter is exact; sources are sometimes a year off, so a second try without it.
      for (const searchYear of year ? [year, undefined] : [undefined]) {
        const results = await this.lookup.search(kind, query, searchYear);
        const fits = results
          .map((c) => {
            const date = c.release_date ?? c.first_air_date ?? '';
            const y = Number(date.slice(0, 4)) || undefined;
            return { c, y };
          })
          .filter(({ c, y }) => {
            if (year && (!y || Math.abs(y - year) > 1)) return false;
            return [c.title, c.original_title, c.name, c.original_name].some((t) =>
              wanted.has(norm(t)),
            );
          })
          .sort((a, b) => Math.abs((a.y ?? 0) - (year ?? 0)) - Math.abs((b.y ?? 0) - (year ?? 0)));
        if (fits[0]) return String(fits[0].c.id);
      }
    }
    return null;
  }

  // IMDb id first (exact), otherwise the same title (English or Arabic) within a year.
  private async findExisting(
    kind: 'movie' | 'show',
    item: LatestSourceItem,
  ): Promise<{ id: string; method: string } | null> {
    const imdb = imdbOf(item.ref);
    const select = { id: true, title: true, titleAr: true, originalTitle: true, releaseDate: true };
    if (imdb) {
      const byImdb =
        kind === 'movie'
          ? await this.prisma.movie.findFirst({
              where: { imdbId: { equals: imdb, mode: 'insensitive' }, deletedAt: null },
              select: { id: true },
            })
          : await this.prisma.tVShow.findFirst({
              where: { imdbId: { equals: imdb, mode: 'insensitive' }, deletedAt: null },
              select: { id: true },
            });
      if (byImdb) return { id: byImdb.id, method: 'tv-imdb' };
    }
    const year = Number(item.year);
    const titles = [item.enTitle, item.arTitle]
      .map((t) => (t ?? '').trim())
      .filter((t) => t.length >= 2);
    if (!titles.length || !year) return null;
    const wanted = new Set(titles.map(norm));
    const or = titles.flatMap((t) => [
      { title: { equals: t, mode: 'insensitive' as const } },
      { titleAr: { equals: t, mode: 'insensitive' as const } },
      { originalTitle: { equals: t, mode: 'insensitive' as const } },
    ]);
    const where = {
      deletedAt: null,
      OR: or,
      releaseDate: {
        gte: new Date(Date.UTC(year - 1, 0, 1)),
        lt: new Date(Date.UTC(year + 2, 0, 1)),
      },
    };
    const rows =
      kind === 'movie'
        ? await this.prisma.movie.findMany({ where, select, take: 3 })
        : await this.prisma.tVShow.findMany({ where, select, take: 3 });
    const hit = rows.find((r) =>
      [r.title, r.titleAr, r.originalTitle].some((t) => wanted.has(norm(t))),
    );
    return hit ? { id: hit.id, method: 'tv-title' } : null;
  }

  // Every title a TV sent is kept in SourceCatalogItem (matchMethod "tv-...") - the admin panel's
  // "from the TVs" list.
  private async record(
    item: LatestSourceItem,
    kind: 'movie' | 'show',
    status: 'MATCHED' | 'UNMATCHED',
    method: string,
    targetId: string | null,
    source: SourceKey = sourceKeyOf(item),
  ): Promise<void> {
    const data = {
      enTitle: item.enTitle?.slice(0, 500) ?? null,
      arTitle: item.arTitle?.slice(0, 500) ?? null,
      year: Number(item.year) || null,
      imdbId: imdbOf(item.ref),
      status,
      matchMethod: method,
      matchedMovieId: kind === 'movie' ? targetId : null,
      matchedShowId: kind === 'show' ? targetId : null,
      lastAttemptAt: new Date(),
      nextRetryAt: null,
    };
    const sourceKind = kind === 'movie' ? ('MOVIE' as const) : ('SERIES' as const);
    try {
      await this.prisma.sourceCatalogItem.upsert({
        where: { source_kind_nb: { source, kind: sourceKind, nb: item.nb } },
        create: { source, kind: sourceKind, nb: item.nb, attempts: 1, ...data },
        update: { ...data, attempts: { increment: 1 } },
      });
    } catch (err) {
      this.logger.warn(
        `record ${item.nb} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // The admin panel's view: titles the TVs sent, most recent first, with what each was linked to.
  async tvLog(limit: number) {
    const tv = { startsWith: 'tv-' };
    const rows = await this.prisma.sourceCatalogItem.findMany({
      where: { matchMethod: tv },
      orderBy: { lastAttemptAt: 'desc' },
      take: limit,
      include: {
        matchedMovie: { select: { id: true, title: true, titleAr: true, status: true } },
        matchedShow: { select: { id: true, title: true, titleAr: true, status: true } },
      },
    });
    const since = new Date(Date.now() - 24 * 3600_000);
    const [matched24h, imported24h, unmatched24h, total] = await Promise.all([
      this.prisma.sourceCatalogItem.count({
        where: { matchMethod: { in: ['tv-imdb', 'tv-title'] }, lastAttemptAt: { gte: since } },
      }),
      this.prisma.sourceCatalogItem.count({
        where: { matchMethod: 'tv-import', lastAttemptAt: { gte: since } },
      }),
      this.prisma.sourceCatalogItem.count({
        where: { status: 'UNMATCHED', matchMethod: tv, lastAttemptAt: { gte: since } },
      }),
      this.prisma.sourceCatalogItem.count({ where: { matchMethod: tv } }),
    ]);
    return {
      stats: { matched24h, imported24h, unmatched24h, total },
      items: rows.map((r) => {
        const target = r.matchedMovie ?? r.matchedShow;
        return {
          source: r.source === 'CEE' ? 'cee' : 'cinemana',
          nb: r.nb,
          kind: r.kind === 'SERIES' ? 'show' : 'movie',
          enTitle: r.enTitle,
          arTitle: r.arTitle,
          year: r.year,
          imdbId: r.imdbId,
          status: r.status,
          method: r.matchMethod,
          at: (r.lastAttemptAt ?? r.updatedAt).toISOString(),
          target: target
            ? { id: target.id, title: target.title, titleAr: target.titleAr, status: target.status }
            : null,
        };
      }),
    };
  }

  private async tmdbIdFor(kind: 'movie' | 'show', imdb: string): Promise<string | null> {
    const found = await this.lookup.findByImdb(imdb);
    const list = kind === 'movie' ? found.movieResults : found.tvResults;
    const first = list[0] as { id?: number | string } | undefined;
    return first?.id != null ? String(first.id) : null;
  }

  // `imported`: the title was just imported because of this report - the only case dated as newly
  // added (sourceMatchedAt, for the "recently added" home row). A title already in the catalog that
  // a source lists again is usually an old one with a new episode, so it isn't dated.
  private async markCompatible(
    kind: 'movie' | 'show',
    id: string,
    imported: boolean,
  ): Promise<void> {
    const newlyCompatible = { id, OR: [{ hasSourceMatch: null }, { hasSourceMatch: false }] };
    if (kind === 'movie') {
      if (imported)
        await this.prisma.movie.updateMany({
          where: newlyCompatible,
          data: { sourceMatchedAt: new Date() },
        });
      await this.prisma.movie.update({ where: { id }, data: { hasSourceMatch: true } });
      await this.prisma.movie.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      });
    } else {
      if (imported)
        await this.prisma.tVShow.updateMany({
          where: newlyCompatible,
          data: { sourceMatchedAt: new Date() },
        });
      await this.prisma.tVShow.update({ where: { id }, data: { hasSourceMatch: true } });
      await this.prisma.tVShow.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      });
    }
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/source-check')
export class SourceLatestAdminController {
  constructor(private readonly service: SourceLatestService) {}

  @Get('tv-log')
  @ApiOperation({
    summary: "Titles the TVs sent from the sources' newly added lists, and what each was linked to",
  })
  tvLog(@Query('limit') limit?: string) {
    return this.service.tvLog(Math.min(Math.max(Number(limit) || 100, 1), 300));
  }

  // The panel's "check the newest now" button: the admin's browser (in Iraq) fetched the sources'
  // newest lists and sends them here, handled exactly like a TV's report but without the caps.
  @Post('latest')
  @HttpCode(200)
  @ApiOperation({ summary: "Handle the sources' newest lists now, sent from the admin panel" })
  latest(@Body() body: LatestSourceBody) {
    return this.service.ingest(body, { admin: true });
  }

  @Post('import')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Import from the sources: report, publish or import titles the admin page found there',
  })
  import(@Body() body: SourceImportBody) {
    return this.service.adminImport(body);
  }
}

@ApiTags('sources')
@Controller('sources')
export class SourceLatestController {
  constructor(private readonly service: SourceLatestService) {}

  // Public: sent by the TV app (guests included). Bounded - at most 60 items a call, each worked on
  // once a day, and a daily cap on TMDB imports.
  @Public()
  @Post('latest')
  @HttpCode(200)
  @ApiOperation({ summary: "The sources' newly added titles, as fetched by the TV app" })
  latest(@Body() body: LatestSourceBody) {
    return this.service.ingest(body);
  }
}
