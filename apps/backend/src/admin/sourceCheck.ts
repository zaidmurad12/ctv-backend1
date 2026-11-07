import { Body, Controller, Get, HttpCode, Injectable, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { Roles } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';

// The source-compatibility check (admin panel > "فحص التوافق"). The sources (Cinemana, CEE) only
// answer requests from inside Iraq, so this server - outside it - can't check them itself; the
// admin's own browser does the matching (same logic as the TV app) and these two endpoints hand it
// the titles to check and store what it found in hasSourceMatch.

const SCOPES = ['unchecked', 'unmatched', 'all'] as const;
const KINDS = ['movie', 'show'] as const;

export class SourceCheckCandidatesQuery {
  @IsIn(SCOPES)
  scope!: (typeof SCOPES)[number];

  @IsIn(KINDS)
  type!: (typeof KINDS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SourceCheckResultItem {
  @IsIn(KINDS)
  type!: (typeof KINDS)[number];

  @IsString()
  id!: string;

  @IsBoolean()
  match!: boolean;
}

export class SourceCheckResultsBody {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SourceCheckResultItem)
  results!: SourceCheckResultItem[];
}

export class MarkRecentBody {
  @IsIn(KINDS)
  type!: (typeof KINDS)[number];

  @IsString()
  id!: string;
}

export interface SourceCheckCandidate {
  type: 'movie' | 'show';
  id: string;
  title: string;
  titleAr: string | null;
  originalTitle: string | null;
  year: number | null;
  imdbId: string | null;
  originalLanguage: string | null;
  hasSourceMatch: boolean | null;
  status: string;
  // Already playable without any search: an admin-entered stream link, or source entries an admin
  // pinned by hand (sourceLinks). Marked compatible straight away by the panel.
  hasPlaybackLink: boolean;
}

@Injectable()
export class SourceCheckService {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  private where(scope: (typeof SCOPES)[number]) {
    // Drafts are checked too - one found on the sources is published (see saveResults).
    const base = { deletedAt: null, status: { in: ['PUBLISHED' as const, 'DRAFT' as const] } };
    if (scope === 'unchecked') return { ...base, hasSourceMatch: null };
    if (scope === 'unmatched') return { ...base, hasSourceMatch: false };
    return base;
  }

  async candidates(
    query: SourceCheckCandidatesQuery,
  ): Promise<{ total: number; items: SourceCheckCandidate[] }> {
    const where = this.where(query.scope);
    const select = {
      id: true,
      title: true,
      titleAr: true,
      originalTitle: true,
      releaseDate: true,
      imdbId: true,
      originalLanguage: true,
      hasSourceMatch: true,
      status: true,
      sourceLinks: true,
    };
    const activeStream = { streams: { some: { isActive: true } } };
    const page = {
      skip: query.offset ?? 0,
      take: query.limit ?? 100,
      orderBy: [{ releaseDate: 'desc' as const }, { id: 'asc' as const }],
    };
    const [total, rows] =
      query.type === 'movie'
        ? await Promise.all([
            this.prisma.movie.count({ where }),
            this.prisma.movie.findMany({
              where,
              select: {
                ...select,
                providers: { where: activeStream, select: { id: true }, take: 1 },
              },
              ...page,
            }),
          ])
        : await Promise.all([
            this.prisma.tVShow.count({ where }),
            this.prisma.tVShow.findMany({
              where,
              select: {
                ...select,
                seasons: {
                  where: { episodes: { some: { providers: { some: activeStream } } } },
                  select: { id: true },
                  take: 1,
                },
              },
              ...page,
            }),
          ]);
    return {
      total,
      items: rows.map((row) => ({
        type: query.type,
        id: row.id,
        title: row.title,
        titleAr: row.titleAr,
        originalTitle: row.originalTitle,
        year: row.releaseDate ? row.releaseDate.getUTCFullYear() : null,
        imdbId: row.imdbId,
        originalLanguage: row.originalLanguage,
        hasSourceMatch: row.hasSourceMatch,
        status: row.status,
        hasPlaybackLink:
          (Array.isArray(row.sourceLinks) && row.sourceLinks.length > 0) ||
          ('providers' in row
            ? (row.providers as unknown[]).length > 0
            : (row.seasons as unknown[]).length > 0),
      })),
    };
  }

  // The admin's "show in recently added" button: the title becomes compatible (and live, if a
  // draft) and is dated now, which puts it at the front of the "recently added" home row.
  async markRecent(body: MarkRecentBody): Promise<{ ok: true }> {
    const data = { hasSourceMatch: true, sourceMatchedAt: new Date() };
    if (body.type === 'movie') {
      await this.prisma.movie.update({ where: { id: body.id }, data });
      await this.prisma.movie.updateMany({
        where: { id: body.id, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      });
    } else {
      await this.prisma.tVShow.update({ where: { id: body.id }, data });
      await this.prisma.tVShow.updateMany({
        where: { id: body.id, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      });
    }
    return { ok: true };
  }

  // A found match always marks the title compatible. "Not found" only ever downgrades a title that
  // wasn't already marked compatible - a title someone confirmed by hand isn't undone by one failed
  // automatic search (a source timing out, a spelling the matcher missed).
  async saveResults(
    body: SourceCheckResultsBody,
  ): Promise<{ matched: number; unmatched: number; published: number }> {
    const ids = (kind: string, match: boolean) =>
      body.results.filter((r) => r.type === kind && r.match === match).map((r) => r.id);
    const downgradable = (list: string[]) => ({
      id: { in: list },
      OR: [{ hasSourceMatch: null }, { hasSourceMatch: false }],
    });
    // Titles turning compatible now get dated first (see Movie.sourceMatchedAt) - and so do
    // compatible ones with no date yet (marked before dates were recorded), so re-checking one here
    // puts it at the front of the "recently added" home row.
    const now = new Date();
    const toDate = (list: string[]) => ({
      id: { in: list },
      OR: [{ hasSourceMatch: null }, { hasSourceMatch: false }, { sourceMatchedAt: null }],
    });
    await Promise.all([
      this.prisma.movie.updateMany({
        where: toDate(ids('movie', true)),
        data: { sourceMatchedAt: now },
      }),
      this.prisma.tVShow.updateMany({
        where: toDate(ids('show', true)),
        data: { sourceMatchedAt: now },
      }),
    ]);
    const [movieFound, movieMissing, showFound, showMissing] = await Promise.all([
      this.prisma.movie.updateMany({
        where: { id: { in: ids('movie', true) } },
        data: { hasSourceMatch: true },
      }),
      this.prisma.movie.updateMany({
        where: downgradable(ids('movie', false)),
        data: { hasSourceMatch: false },
      }),
      this.prisma.tVShow.updateMany({
        where: { id: { in: ids('show', true) } },
        data: { hasSourceMatch: true },
      }),
      this.prisma.tVShow.updateMany({
        where: downgradable(ids('show', false)),
        data: { hasSourceMatch: false },
      }),
    ]);
    const matched = movieFound.count + showFound.count;
    const unmatched = movieMissing.count + showMissing.count;
    // A draft found on the sources goes live.
    const [moviePublished, showPublished] = await Promise.all([
      this.prisma.movie.updateMany({
        where: { id: { in: ids('movie', true) }, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      }),
      this.prisma.tVShow.updateMany({
        where: { id: { in: ids('show', true) }, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      }),
    ]);
    const published = moviePublished.count + showPublished.count;
    return { matched, unmatched, published };
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/source-check')
export class SourceCheckController {
  constructor(private readonly service: SourceCheckService) {}

  @Get('candidates')
  @ApiOperation({ summary: 'Titles for the browser-side source-compatibility check' })
  candidates(@Query() query: SourceCheckCandidatesQuery) {
    return this.service.candidates(query);
  }

  @Post('results')
  @HttpCode(200)
  @ApiOperation({ summary: 'Store source-compatibility results found by the admin panel' })
  results(@Body() body: SourceCheckResultsBody) {
    return this.service.saveResults(body);
  }

  @Post('mark-recent')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a title compatible and put it first in the recently added row' })
  markRecent(@Body() body: MarkRecentBody) {
    return this.service.markRecent(body);
  }
}
