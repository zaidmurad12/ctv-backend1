import { Body, Controller, Get, HttpCode, Injectable, Logger, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
}

export class LatestSourceBody {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LatestSourceItem)
  items!: LatestSourceItem[];
}

const IMPORTS_PER_DAY = 40;
const IMPORTS_PER_CALL = 8;
const CALL_BUDGET_MS = 200_000;
const RETRY_UNMATCHED_MS = 3 * 24 * 3600_000;

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
    const nbs = items.map((i) => i.nb).filter((nb) => /^\d+$/.test(nb));
    const done = new Set<string>();
    if (!nbs.length) return done;
    const retryAfter = new Date(Date.now() - RETRY_UNMATCHED_MS);
    const rows = await this.prisma.sourceCatalogItem.findMany({
      where: { source: 'CINEMANA', nb: { in: nbs } },
      select: { kind: true, nb: true, status: true, matchMethod: true, lastAttemptAt: true },
    });
    for (const row of rows) {
      const recentMiss =
        row.status === 'UNMATCHED' &&
        !!row.matchMethod?.startsWith('tv-') &&
        (row.matchMethod === 'tv-noref' ||
          (row.lastAttemptAt != null && row.lastAttemptAt > retryAfter));
      if (row.status === 'MATCHED' || recentMiss) {
        done.add(`${row.kind === 'SERIES' ? 'series' : 'movie'}:${row.nb}`);
      }
    }
    return done;
  }

  // `done` lists the source numbers that need no further sending (handled now or earlier); the TV
  // remembers them and sends only the rest next time. Titles left out because of the per-call or
  // per-day import caps are not in it, so they are sent again later.
  async ingest(
    body: LatestSourceBody,
  ): Promise<{ matched: number; imported: number; skipped: number; done: string[] }> {
    const started = Date.now();
    const now = Date.now();
    for (const [nb, at] of this.seen) if (now - at > 24 * 3600_000) this.seen.delete(nb);
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.importDay) {
      this.importDay = today;
      this.importsToday = 0;
    }

    let matched = 0;
    let imported = 0;
    let skipped = 0;
    let importsThisCall = 0;
    const handled = await this.alreadyHandled(body.items);
    const done = new Set<string>();
    for (const item of body.items) {
      if (
        !/^\d+$/.test(item.nb) ||
        this.seen.has(item.nb) ||
        handled.has(`${item.kind}:${item.nb}`)
      ) {
        skipped++;
        done.add(item.nb);
        continue;
      }
      if (Date.now() - started > CALL_BUDGET_MS) break;
      const kind = item.kind === 'series' ? 'show' : 'movie';
      try {
        const found = await this.findExisting(kind, item);
        if (found) {
          await this.markCompatible(kind, found.id);
          await this.record(item, kind, 'MATCHED', found.method, found.id);
          matched++;
          done.add(item.nb);
          this.seen.set(item.nb, now);
          continue;
        }
        const imdb = imdbOf(item.ref);
        if (!imdb || importsThisCall >= IMPORTS_PER_CALL || this.importsToday >= IMPORTS_PER_DAY) {
          if (!imdb) {
            this.seen.set(item.nb, now);
            await this.record(item, kind, 'UNMATCHED', 'tv-noref', null);
            done.add(item.nb);
          }
          skipped++;
          continue;
        }
        const tmdbId = await this.tmdbIdFor(kind, imdb);
        this.seen.set(item.nb, now);
        if (!tmdbId) {
          await this.record(item, kind, 'UNMATCHED', 'tv-notmdb', null);
          done.add(item.nb);
          skipped++;
          continue;
        }
        importsThisCall++;
        this.importsToday++;
        const id =
          kind === 'movie'
            ? await this.importer.importMovie(tmdbId)
            : await this.importer.importShow(tmdbId);
        await this.markCompatible(kind, id);
        await this.record(item, kind, 'MATCHED', 'tv-import', id);
        imported++;
        done.add(item.nb);
        this.logger.log(`imported ${kind} ${imdb} (source nb ${item.nb}) -> ${id}`);
      } catch (err) {
        skipped++;
        this.logger.warn(
          `item ${item.nb} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { matched, imported, skipped, done: [...done] };
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
        where: { source_kind_nb: { source: 'CINEMANA', kind: sourceKind, nb: item.nb } },
        create: { source: 'CINEMANA', kind: sourceKind, nb: item.nb, attempts: 1, ...data },
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

  private async markCompatible(kind: 'movie' | 'show', id: string): Promise<void> {
    if (kind === 'movie') {
      await this.prisma.movie.update({ where: { id }, data: { hasSourceMatch: true } });
      await this.prisma.movie.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      });
    } else {
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
