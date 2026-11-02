import { adminListOrderBy, isDefaultNewestSort, releasedFirstPage } from './adminListSort.js';
import { parseSourceLinks } from '../../common/sourceLinks.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type {
  AdminMovieDetailDto,
  AdminMovieSummaryDto,
  CreateStreamDto,
  CreateSubtitleDto,
  UpdateMovieDto,
  UpdateStreamDto,
  UpdateSubtitleDto,
} from '../dto.js';
import { ArchiveOrgService } from './archiveOrgService.js';
import { MovieHashService } from './movieHashService.js';
import type { SubtitleCandidate } from './openSubtitlesService.js';
import { OpenSubtitlesService } from './openSubtitlesService.js';
import { fetchSubtitleTextSafely, isLikelyLanguageMatch } from './subtitleTextUtils.js';
import { TmdbImportService } from './tmdbImportService.js';

// Streams/subtitles attach to a MovieProvider, not to a Movie directly (see schema.prisma) -
// every real import already has one of these (TMDB Import, Consumet, ...). Admin-entered links
// need one too, so this creates a "Manual (Admin Panel)" Provider row the first time any movie
// gets its first admin-entered stream/subtitle, and reuses the same MovieProvider row after
// that (one per movie, upserted on the movieId+providerId unique constraint already on that
// table) rather than creating a new one on every call.
const MANUAL_PROVIDER_SLUG = 'admin-manual';
const OPENSUBTITLES_PROVIDER_SLUG = 'opensubtitles';
const ARCHIVE_ORG_PROVIDER_SLUG = 'internet-archive';

// The URL this backend is actually reachable at - needed to build a stable
// /subtitles/:id/resolve link for OpenSubtitles-sourced subtitles (see importSubtitle below and
// Subtitle.externalFileId's own comment in schema.prisma). Overridable for local runs; defaults
// to the deployed Cloud Run service every client in this project already points at.
const PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL || 'https://ctv-platform-backend-afcem6ospa-ww.a.run.app/api/v1';

@Injectable()
export class AdminMoviesRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(
    prismaService: PrismaService,
    private readonly tmdbImport: TmdbImportService,
    private readonly openSubtitles: OpenSubtitlesService,
    private readonly movieHash: MovieHashService,
    private readonly archiveOrg: ArchiveOrgService,
  ) {
    this.prisma = prismaService.client;
  }

  async list(params: {
    page?: number;
    limit?: number;
    search?: string;
    genre?: string;
    language?: string;
    hasStream?: boolean;
    hasSubtitle?: boolean;
    hasSourceMatch?: boolean;
    missingArabicTitle?: boolean;
    missingArtwork?: boolean;
    sort?: string;
    status?: string;
  }): Promise<{ items: AdminMovieSummaryDto[]; total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.search) {
      // Arabic-language search terms never matched anything, since only the English `title` was
      // checked - `titleAr` needs its own condition alongside it, not a replacement for it (an
      // admin searching in either language should find the title either way).
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { titleAr: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.language) {
      where.originalLanguage = params.language;
    }
    if (params.status) {
      where.status = params.status;
    }
    if (params.genre) {
      where.genres = { some: { genre: { name: params.genre } } };
    }
    // Two independent conditions on the same `providers` relation (a movie can have a stream on
    // one provider row and a subtitle on another) - each needs its own AND entry rather than
    // merging into a single `providers: {...}` filter, since Prisma can't express "some of
    // these rows satisfy X" and "none satisfy Y" as one relation filter.
    const andConditions: Record<string, unknown>[] = [];
    if (params.hasStream !== undefined) {
      const hasActiveStream = { providers: { some: { streams: { some: { isActive: true } } } } };
      andConditions.push(params.hasStream ? hasActiveStream : { NOT: hasActiveStream });
    }
    if (params.hasSubtitle !== undefined) {
      const hasAnySubtitle = { providers: { some: { subtitles: { some: {} } } } };
      if (params.hasSubtitle) {
        andConditions.push(hasAnySubtitle);
      } else {
        // An Arabic-original movie doesn't need a subtitle to begin with - reported as "Arabic
        // titles shouldn't show up under the 'missing subtitle' classification," which they did
        // here regardless of language, since this only ever checked whether a subtitle row
        // existed.
        andConditions.push({ NOT: hasAnySubtitle, originalLanguage: { not: 'ar' } });
      }
    }
    // A real column (see ScheduledImportService's own sourceMatchCheck), not a relation filter -
    // true/false only ever match a movie that's actually been checked; a movie that hasn't
    // (column still null) matches neither, which is the intended "not checked yet" exclusion
    // (see AdminListMoviesQueryDto's own comment).
    if (params.hasSourceMatch !== undefined) {
      where.hasSourceMatch = params.hasSourceMatch;
    }
    // Arabic-language source matching (CEE/Cinemana, see calculateMatchScore in the RN app) leans
    // heavily on titleAr for an exact match - a movie with no Arabic title on file falls back to
    // English/fuzzy matching even when its original language is Arabic, which is exactly the
    // weaker path. This is what the "بحاجة استيراد اسم عربي" backfill job/admin filter targets -
    // an empty string counts as missing the same as a genuinely null one.
    const missingArabicTitle = { OR: [{ titleAr: null }, { titleAr: '' }] };
    if (params.missingArabicTitle !== undefined) {
      andConditions.push(params.missingArabicTitle ? missingArabicTitle : { NOT: missingArabicTitle });
    }
    // "Missing artwork" means missing *either* the logo or the backdrop (not both) - a title with
    // a poster and a backdrop but no logo still needs an admin's attention, the same as one with
    // neither.
    const hasLogo = { images: { some: { type: 'LOGO' } } };
    const hasBackdrop = { images: { some: { type: 'BACKDROP' } } };
    if (params.missingArtwork !== undefined) {
      andConditions.push(
        params.missingArtwork ? { OR: [{ NOT: hasLogo }, { NOT: hasBackdrop }] } : { AND: [hasLogo, hasBackdrop] },
      );
    }
    if (andConditions.length) where.AND = andConditions;

    const include = { images: true, providers: { include: { streams: true, subtitles: true } } };
    const [rows, total] = await Promise.all([
      isDefaultNewestSort(params.sort)
        ? releasedFirstPage(this.prisma.movie as never, where, include, page, limit)
        : this.prisma.movie.findMany({
        where,
        include,
        skip: (page - 1) * limit,
        take: limit,
        // "Newest" here means newest release, not newest added to the catalog - same fix as the
        // app's own "الأحدث" home rail (see the RN app's fetchMovies), which had the identical
        // mix-up.
        orderBy: adminListOrderBy(params.sort),
      }),
      this.prisma.movie.count({ where }),
    ]);

    // Rows from releasedFirstPage come back untyped (it serves both models); same shape as findMany's.
    return { items: rows.map((row) => this.toSummary(row as never)), total };
  }

  /** Distinct genre names / original languages across every non-deleted movie, for the admin list's filter dropdowns. */
  async listFilterOptions(): Promise<{ genres: string[]; languages: string[] }> {
    const [genres, languages] = await Promise.all([
      this.prisma.genre.findMany({
        where: { movies: { some: { movie: { deletedAt: null } } } },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.movie.findMany({
        where: { deletedAt: null, originalLanguage: { not: null } },
        select: { originalLanguage: true },
        distinct: ['originalLanguage'],
      }),
    ]);
    return {
      genres: genres.map((g) => g.name),
      languages: languages.map((m) => m.originalLanguage as string).sort(),
    };
  }

  async importNew(tmdbId: string): Promise<string> {
    return this.tmdbImport.importMovie(tmdbId);
  }

  async reimport(id: string): Promise<string> {
    const movie = await this.prisma.movie.findFirst({
      where: { id, deletedAt: null },
      select: { tmdbId: true },
    });
    if (!movie) throw new NotFoundException(`Movie "${id}" not found.`);
    if (!movie.tmdbId)
      throw new NotFoundException(`Movie "${id}" has no TMDB id to re-import from.`);
    return this.tmdbImport.importMovie(movie.tmdbId);
  }

  /** The current home hero/banner selection, in order, for the admin banner-management page. */
  async listFeatured(): Promise<AdminMovieSummaryDto[]> {
    const rows = await this.prisma.movie.findMany({
      where: { deletedAt: null, featuredOrder: { not: null } },
      include: { images: true, providers: { include: { streams: true, subtitles: true } } },
      orderBy: { featuredOrder: 'asc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  /**
   * Full replace: `entries` is the complete, ordered banner selection among movies - any
   * currently-featured movie left out of it is un-featured. Simpler and less error-prone for a
   * reorderable admin list (which always has the full list in hand anyway) than diffing adds/
   * removes/moves. `order` is each movie's *global* position across the whole combined movie+
   * show carousel (assigned by the admin controller merging both types into one sequence), not
   * just its index within this movie-only array - otherwise two movies either side of a
   * featured show would both end up with the same order value as if the show weren't there.
   */
  async setFeatured(entries: { id: string; order: number }[]): Promise<void> {
    const ids = entries.map((e) => e.id);
    await this.prisma.$transaction([
      this.prisma.movie.updateMany({
        where: { featuredOrder: { not: null }, id: { notIn: ids } },
        data: { featuredOrder: null },
      }),
      ...entries.map((e) =>
        this.prisma.movie.update({ where: { id: e.id }, data: { featuredOrder: e.order } }),
      ),
    ]);
  }

  async delete(id: string): Promise<void> {
    const movie = await this.prisma.movie.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!movie) throw new NotFoundException(`Movie "${id}" not found.`);
    await this.prisma.movie.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async findById(id: string): Promise<AdminMovieDetailDto | null> {
    const row = await this.prisma.movie.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: true,
        providers: { include: { streams: true, subtitles: true } },
      },
    });
    if (!row) return null;

    const streams = row.providers.flatMap((p) => p.streams);
    const subtitles = row.providers.flatMap((p) => p.subtitles);

    return {
      ...this.toSummary(row),
      overview: row.overview,
      sourceLinks: parseSourceLinks(row.sourceLinks),
      streams: streams.map((s) => ({
        id: s.id,
        quality: s.quality,
        serverName: s.serverName,
        streamUrl: s.streamUrl,
        language: s.language,
        isDefault: s.isDefault,
        isActive: s.isActive,
      })),
      subtitles: subtitles.map((s) => ({
        id: s.id,
        language: s.language,
        format: s.format,
        url: s.url,
        isDefault: s.isDefault,
        syncAnalysisStatus: s.syncAnalysisStatus,
        defaultOffsetMs: s.defaultOffsetMs,
        defaultSpeed: s.defaultSpeed,
      })),
    };
  }

  async update(id: string, dto: UpdateMovieDto): Promise<void> {
    const movie = await this.prisma.movie.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!movie) throw new NotFoundException(`Movie "${id}" not found.`);

    // poster/backdrop/logo aren't read from Movie's own scalar columns anywhere (the app's
    // artwork always comes from the Image table - see movieQueryRepository's mapImagesToArtwork)
    // so a manual edit here has to replace the Image row of that type, not just set the column.
    const { poster, backdrop, logo, ...rest } = dto;
    // Stored as plain JSON (class-validator hands over class instances).
    if (rest.sourceLinks) rest.sourceLinks = rest.sourceLinks.map((l) => ({ source: l.source, nb: l.nb, kind: l.kind }));
    // UpdateMovieDto.status is validated against the same 3 values at the API boundary
    // (@IsIn in dto.ts) but typed as a plain string there (so the DTO file doesn't need to
    // import a Prisma-generated enum) - Prisma's own update() wants its actual enum type,
    // not string, hence the cast.
    if (Object.keys(rest).length > 0) {
      await this.prisma.movie.update({
        where: { id },
        data: rest as Parameters<typeof this.prisma.movie.update>[0]['data'],
      });
    }

    const imageEdits: Array<{ type: 'POSTER' | 'BACKDROP' | 'LOGO'; url?: string }> = [
      { type: 'POSTER', url: poster },
      { type: 'BACKDROP', url: backdrop },
      { type: 'LOGO', url: logo },
    ];
    for (const edit of imageEdits) {
      if (!edit.url) continue;
      await this.prisma.image.deleteMany({ where: { movieId: id, type: edit.type } });
      await this.prisma.image.create({
        data: { movieId: id, type: edit.type, url: edit.url, provider: 'admin-manual' },
      });
    }
  }

  async addStream(movieId: string, dto: CreateStreamDto): Promise<void> {
    const movieProviderId = await this.ensureMovieProvider(movieId);
    await this.prisma.stream.create({
      data: {
        movieProviderId,
        quality: dto.quality,
        serverName: dto.serverName ?? null,
        streamUrl: dto.streamUrl,
        language: dto.language ?? null,
        isDefault: dto.isDefault ?? false,
        isActive: true,
      },
    });
  }

  async updateStream(streamId: string, dto: UpdateStreamDto): Promise<void> {
    const stream = await this.prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true },
    });
    if (!stream) throw new NotFoundException(`Stream "${streamId}" not found.`);
    await this.prisma.stream.update({ where: { id: streamId }, data: dto });
  }

  async deleteStream(streamId: string): Promise<void> {
    await this.prisma.stream.delete({ where: { id: streamId } }).catch(() => {
      throw new NotFoundException(`Stream "${streamId}" not found.`);
    });
  }

  async addSubtitle(movieId: string, dto: CreateSubtitleDto): Promise<void> {
    const movieProviderId = await this.ensureMovieProvider(movieId);
    await this.prisma.subtitle.create({
      data: {
        movieProviderId,
        language: dto.language,
        format: dto.format ?? 'vtt',
        url: dto.url,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async updateSubtitle(subtitleId: string, dto: UpdateSubtitleDto): Promise<void> {
    const subtitle = await this.prisma.subtitle.findUnique({
      where: { id: subtitleId },
      select: { id: true },
    });
    if (!subtitle) throw new NotFoundException(`Subtitle "${subtitleId}" not found.`);
    await this.prisma.subtitle.update({ where: { id: subtitleId }, data: dto });
  }

  async deleteSubtitle(subtitleId: string): Promise<void> {
    const subtitle = await this.prisma.subtitle.findUnique({
      where: { id: subtitleId },
      select: { id: true },
    });
    if (!subtitle) throw new NotFoundException(`Subtitle "${subtitleId}" not found.`);
    await this.prisma.subtitle.delete({ where: { id: subtitleId } });
  }

  async searchSubtitles(movieId: string, language: string): Promise<SubtitleCandidate[]> {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, deletedAt: null },
      select: { title: true, releaseDate: true, imdbId: true },
    });
    if (!movie) throw new NotFoundException(`Movie "${movieId}" not found.`);
    const year = movie.releaseDate ? movie.releaseDate.getUTCFullYear() : null;
    return this.openSubtitles.search(movie.title, year, language, movie.imdbId);
  }

  /**
   * Title/imdb search (searchSubtitles above) only ever finds *a* subtitle for the movie in
   * general, not necessarily one timed for this exact file - see MovieHashService's own comment
   * for why that matters. Hashes the movie's own active stream directly (never the whole file,
   * just 128KB of ranged reads) and searches OpenSubtitles by that instead.
   */
  async searchSubtitlesByHash(movieId: string, language: string): Promise<SubtitleCandidate[]> {
    const stream = await this.prisma.stream.findFirst({
      where: { isActive: true, movieProvider: { movieId } },
      orderBy: { isDefault: 'desc' },
      select: { streamUrl: true },
    });
    if (!stream) throw new NotFoundException(`Movie "${movieId}" has no active stream to hash.`);
    const hash = await this.movieHash.computeHash(stream.streamUrl);
    if (!hash) return [];
    return this.openSubtitles.searchByHash(hash, language);
  }

  /**
   * Attaches a specific Internet Archive video file to a movie as a real, playable Stream - only
   * once its license is a recognized public-domain/Creative Commons one (see
   * ArchiveOrgService.isRecognizedOpenLicense's own comment on why collection membership alone
   * isn't enough). The movie itself still has to already exist (imported normally from TMDB first,
   * for real poster/backdrop/cast/overview) - this only ever adds the stream, exactly like
   * addStream above, just sourced from Internet Archive instead of a manually pasted URL.
   */
  async importArchiveOrgStream(movieId: string, identifier: string, fileName: string): Promise<void> {
    const item = await this.archiveOrg.getItem(identifier);
    if (!item.isRecognizedOpenLicense) {
      throw new BadRequestException(
        `"${item.title}" has no recognized public-domain/Creative Commons license on Internet Archive (licenseurl: ${item.licenseUrl ?? 'none'}) - refusing to import it as a stream.`,
      );
    }
    const file = item.videoFiles.find((f) => f.name === fileName);
    if (!file) {
      throw new BadRequestException(`File "${fileName}" not found on Internet Archive item "${identifier}".`);
    }
    const movieProviderId = await this.ensureMovieProvider(
      movieId,
      ARCHIVE_ORG_PROVIDER_SLUG,
      'Internet Archive',
    );
    await this.prisma.stream.create({
      data: {
        movieProviderId,
        quality: file.quality ?? 'SD',
        serverName: 'Internet Archive',
        streamUrl: file.url,
        isDefault: false,
        isActive: true,
      },
    });
  }

  /**
   * Attaches an OpenSubtitles search result to a movie without ever downloading/re-hosting the
   * file - `url` is a stable link into this backend's own /subtitles/:id/resolve, which
   * re-resolves OpenSubtitles' own (short-lived) download link fresh every time it's actually
   * called (see externalFileId's comment in schema.prisma).
   */
  async importSubtitle(movieId: string, fileId: string, language: string): Promise<void> {
    const movieProviderId = await this.ensureMovieProvider(
      movieId,
      OPENSUBTITLES_PROVIDER_SLUG,
      'OpenSubtitles',
    );
    const created = await this.prisma.subtitle.create({
      data: { movieProviderId, language, format: 'srt', url: '', externalFileId: fileId },
    });
    await this.prisma.subtitle.update({
      where: { id: created.id },
      data: { url: `${PUBLIC_API_BASE_URL}/subtitles/${created.id}/resolve` },
    });

    // Resolving right away (rather than waiting for the app's own first playback) is what makes
    // sync analysis possible at all here - it also happens to double as an early cache fill for
    // resolvedContent, saving that same OpenSubtitles download-quota unit from being spent again
    // on the app's own first real resolve.
    const link = await this.openSubtitles.resolveDownloadLink(fileId);
    if (link) {
      const content = await fetchSubtitleTextSafely(link, language);
      // OpenSubtitles' own language tag on a search/hash result is occasionally just wrong (or
      // the source file was mis-encoded in a way even the fallback decoder can't recover) -
      // reported as "some subtitles show up garbled or in the wrong language." Leaving the
      // Subtitle row in "failed" rather than attaching bad content is what keeps a mismatched
      // import from silently reaching viewers as if it were a working Arabic track.
      if (content && isLikelyLanguageMatch(content, language)) {
        await this.prisma.subtitle.update({
          where: { id: created.id },
          data: { resolvedUrl: link, resolvedContent: content },
        });
        return;
      }
    }
    await this.prisma.subtitle.update({
      where: { id: created.id },
      data: { syncAnalysisStatus: 'failed' },
    });
  }

  /**
   * For an admin who already has the subtitle *file* downloaded locally, not a working direct-
   * file URL to paste into addSubtitle - stores the content itself in resolvedContent, which
   * /subtitles/:id/resolve already serves straight from the database before it ever looks at
   * externalFileId or url (see its own comment), so nothing else needs to change to make an
   * uploaded subtitle playable. `url` is still set (schema requires it, and it's a harmless,
   * always-correct self-link) even though resolve never actually needs to follow it here.
   */
  async uploadSubtitle(
    movieId: string,
    language: string,
    format: string,
    content: string,
  ): Promise<void> {
    // Catches the wrong file being picked for the wrong language row (the encoding itself is
    // already handled client-side, in readSubtitleFileAsText) - failing loudly here, before
    // anything is saved, beats silently attaching a subtitle that turns out not to match once a
    // viewer opens it.
    if (!isLikelyLanguageMatch(content, language)) {
      throw new BadRequestException(
        `This file doesn't look like a "${language}" subtitle - check you picked the right file.`,
      );
    }
    const movieProviderId = await this.ensureMovieProvider(movieId);
    const created = await this.prisma.subtitle.create({
      data: { movieProviderId, language, format, url: '', resolvedContent: content },
    });
    await this.prisma.subtitle.update({
      where: { id: created.id },
      data: { url: `${PUBLIC_API_BASE_URL}/subtitles/${created.id}/resolve` },
    });
  }

  private async ensureMovieProvider(
    movieId: string,
    providerSlug: string = MANUAL_PROVIDER_SLUG,
    providerName: string = 'Manual (Admin Panel)',
  ): Promise<string> {
    const movie = await this.prisma.movie.findFirst({
      where: { id: movieId, deletedAt: null },
      select: { id: true },
    });
    if (!movie) throw new NotFoundException(`Movie "${movieId}" not found.`);

    const provider = await this.prisma.provider.upsert({
      where: { slug: providerSlug },
      create: {
        name: providerName,
        slug: providerSlug,
        version: '1.0.0',
        isEnabled: true,
        healthStatus: 'HEALTHY',
      },
      update: {},
    });

    const movieProvider = await this.prisma.movieProvider.upsert({
      where: { movieId_providerId: { movieId, providerId: provider.id } },
      create: { movieId, providerId: provider.id },
      update: {},
    });
    return movieProvider.id;
  }

  private toSummary(row: {
    id: string;
    title: string;
    titleAr: string | null;
    status: string;
    originalLanguage: string | null;
    rating: unknown;
    releaseDate: Date | null;
    featuredOrder: number | null;
    hasSourceMatch: boolean | null;
    images: Array<{ type: string; url: string }>;
    providers: Array<{ streams: Array<{ isActive: boolean }>; subtitles: Array<unknown> }>;
  }): AdminMovieSummaryDto {
    return {
      id: row.id,
      title: row.title,
      titleAr: row.titleAr,
      status: row.status,
      originalLanguage: row.originalLanguage,
      poster: [...row.images].reverse().find((img) => img.type === 'POSTER')?.url ?? null,
      backdrop: [...row.images].reverse().find((img) => img.type === 'BACKDROP')?.url ?? null,
      logo: [...row.images].reverse().find((img) => img.type === 'LOGO')?.url ?? null,
      rating: row.rating === null ? null : Number(row.rating),
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      hasPlayableStream: row.providers.some((p) => p.streams.some((s) => s.isActive)),
      hasSubtitles: row.providers.some((p) => p.subtitles.length > 0),
      hasSourceMatch: row.hasSourceMatch,
      featuredOrder: row.featuredOrder,
    };
  }
}
