import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type {
  AdminShowDetailDto,
  AdminShowSummaryDto,
  CreateStreamDto,
  CreateSubtitleDto,
  UpdateShowDto,
} from '../dto.js';
import { AudioSyncAnalysisService } from './audioSyncAnalysisService.js';
import { MovieHashService } from './movieHashService.js';
import type { SubtitleCandidate } from './openSubtitlesService.js';
import { OpenSubtitlesService } from './openSubtitlesService.js';
import { fetchSubtitleTextSafely, isLikelyLanguageMatch } from './subtitleTextUtils.js';
import { TmdbImportService } from './tmdbImportService.js';

// Same manual/OpenSubtitles Provider rows admin movie edits reuse (see adminMoviesRepository's
// own comment) - a show's episodes attach streams/subtitles through an EpisodeProvider, which
// needs a Provider row to point at just like a MovieProvider does.
const MANUAL_PROVIDER_SLUG = 'admin-manual';
const OPENSUBTITLES_PROVIDER_SLUG = 'opensubtitles';

const PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL || 'https://ctv-platform-backend-afcem6ospa-ww.a.run.app/api/v1';

type EpisodeWithProviders = {
  id: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  stillImage: string | null;
  airDate: Date | null;
  providers: Array<{
    streams: Array<{
      id: string;
      quality: string;
      serverName: string | null;
      streamUrl: string;
      language: string | null;
      isDefault: boolean;
      isActive: boolean;
    }>;
    subtitles: Array<{
      id: string;
      language: string;
      format: string;
      url: string;
      isDefault: boolean;
      syncAnalysisStatus: string;
      defaultOffsetMs: number;
      defaultSpeed: number;
    }>;
  }>;
};

@Injectable()
export class AdminShowsRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(
    prismaService: PrismaService,
    private readonly tmdbImport: TmdbImportService,
    private readonly openSubtitles: OpenSubtitlesService,
    private readonly movieHash: MovieHashService,
    private readonly audioSyncAnalysis: AudioSyncAnalysisService,
  ) {
    this.prisma = prismaService.client;
  }

  /** Same automatic sync analysis as AdminMoviesRepository's own, for one episode. */
  private async triggerSyncAnalysis(
    episodeId: string,
    subtitleId: string,
    content: string,
  ): Promise<void> {
    const stream = await this.prisma.stream.findFirst({
      where: { isActive: true, episodeProvider: { episodeId } },
      orderBy: { isDefault: 'desc' },
      select: { streamUrl: true },
    });
    if (!stream) return;
    this.audioSyncAnalysis.analyzeInBackground(subtitleId, stream.streamUrl, content);
  }

  async list(params: {
    page?: number;
    limit?: number;
    search?: string;
    genre?: string;
    language?: string;
    missingStream?: boolean;
    missingSubtitle?: boolean;
    status?: string;
  }): Promise<{ items: AdminShowSummaryDto[]; total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: Record<string, unknown> = { deletedAt: null };
    if (params.search) {
      // Same fix as AdminMoviesRepository.list - Arabic search terms never matched anything since
      // only the English `title` was checked.
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
    // "Missing" (not movies' own "has at least one") - an episode entirely without an active
    // stream/any subtitle, found via a negated nested `some`, is what actually flags a show as
    // needing admin attention; "has at least one somewhere" would stay true even with 39 of 40
    // episodes still missing theirs.
    const andConditions: Record<string, unknown>[] = [];
    if (params.missingStream !== undefined) {
      const hasEpisodeMissingStream = {
        seasons: {
          some: {
            episodes: {
              some: { NOT: { providers: { some: { streams: { some: { isActive: true } } } } } },
            },
          },
        },
      };
      andConditions.push(
        params.missingStream ? hasEpisodeMissingStream : { NOT: hasEpisodeMissingStream },
      );
    }
    if (params.missingSubtitle !== undefined) {
      const hasEpisodeMissingSubtitle = {
        seasons: {
          some: {
            episodes: { some: { NOT: { providers: { some: { subtitles: { some: {} } } } } } },
          },
        },
      };
      if (params.missingSubtitle) {
        // An Arabic-original show doesn't need a subtitle to begin with - reported as "Arabic
        // titles shouldn't show up under the 'missing subtitle' classification," which they did
        // here regardless of language, since this only ever checked whether an episode's subtitle
        // row existed.
        andConditions.push({ ...hasEpisodeMissingSubtitle, originalLanguage: { not: 'ar' } });
      } else {
        andConditions.push({ NOT: hasEpisodeMissingSubtitle });
      }
    }
    if (andConditions.length) where.AND = andConditions;

    const [rows, total] = await Promise.all([
      this.prisma.tVShow.findMany({
        where,
        include: {
          images: true,
          seasons: {
            include: {
              episodes: { include: { providers: { include: { streams: true, subtitles: true } } } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        // Same fix as AdminMoviesRepository.list - "newest" means newest release, not newest
        // added to the catalog.
        orderBy: { releaseDate: 'desc' },
      }),
      this.prisma.tVShow.count({ where }),
    ]);

    return { items: rows.map((row) => this.toSummary(row)), total };
  }

  /** Distinct genre names / original languages across every non-deleted show, for the admin list's filter dropdowns. */
  async listFilterOptions(): Promise<{ genres: string[]; languages: string[] }> {
    const [genres, languages] = await Promise.all([
      this.prisma.genre.findMany({
        where: { shows: { some: { show: { deletedAt: null } } } },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tVShow.findMany({
        where: { deletedAt: null, originalLanguage: { not: null } },
        select: { originalLanguage: true },
        distinct: ['originalLanguage'],
      }),
    ]);
    return {
      genres: genres.map((g) => g.name),
      languages: languages.map((s) => s.originalLanguage as string).sort(),
    };
  }

  /** The current home hero/banner selection among shows, in order - see AdminMoviesRepository's own listFeatured() for the movie half of this shared carousel. */
  async listFeatured(): Promise<AdminShowSummaryDto[]> {
    const rows = await this.prisma.tVShow.findMany({
      where: { deletedAt: null, featuredOrder: { not: null } },
      include: {
        images: true,
        seasons: {
          include: {
            episodes: { include: { providers: { include: { streams: true, subtitles: true } } } },
          },
        },
      },
      orderBy: { featuredOrder: 'asc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  /**
   * `entries` carries each show's *global* position across the whole combined movie+show
   * carousel (assigned by the admin controller, not just this table's own index) - see
   * AdminMoviesRepository.setFeatured's own comment for why a plain ordered id list isn't enough
   * once two separate tables need to interleave into one sequence.
   */
  async setFeatured(entries: { id: string; order: number }[]): Promise<void> {
    const ids = entries.map((e) => e.id);
    await this.prisma.$transaction([
      this.prisma.tVShow.updateMany({
        where: { featuredOrder: { not: null }, id: { notIn: ids } },
        data: { featuredOrder: null },
      }),
      ...entries.map((e) =>
        this.prisma.tVShow.update({ where: { id: e.id }, data: { featuredOrder: e.order } }),
      ),
    ]);
  }

  async importNew(tmdbId: string): Promise<string> {
    return this.tmdbImport.importShow(tmdbId);
  }

  async reimport(id: string): Promise<string> {
    const show = await this.prisma.tVShow.findFirst({
      where: { id, deletedAt: null },
      select: { tmdbId: true },
    });
    if (!show) throw new NotFoundException(`Show "${id}" not found.`);
    if (!show.tmdbId) throw new NotFoundException(`Show "${id}" has no TMDB id to re-import from.`);
    return this.tmdbImport.importShow(show.tmdbId);
  }

  async delete(id: string): Promise<void> {
    const show = await this.prisma.tVShow.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!show) throw new NotFoundException(`Show "${id}" not found.`);
    await this.prisma.tVShow.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async findById(id: string): Promise<AdminShowDetailDto | null> {
    const row = await this.prisma.tVShow.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: true,
        seasons: {
          orderBy: { seasonNumber: 'asc' },
          include: {
            episodes: {
              orderBy: { episodeNumber: 'asc' },
              include: { providers: { include: { streams: true, subtitles: true } } },
            },
          },
        },
      },
    });
    if (!row) return null;

    return {
      ...this.toSummary(row),
      overview: row.overview,
      seasons: row.seasons.map((season) => ({
        id: season.id,
        seasonNumber: season.seasonNumber,
        name: season.name,
        airDate: season.airDate ? season.airDate.toISOString() : null,
        episodes: season.episodes.map((episode) =>
          this.toEpisodeSummary(season.seasonNumber, episode),
        ),
      })),
    };
  }

  async update(id: string, dto: UpdateShowDto): Promise<void> {
    const show = await this.prisma.tVShow.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!show) throw new NotFoundException(`Show "${id}" not found.`);

    // poster/backdrop/logo aren't read from TVShow's own scalar columns anywhere (artwork always
    // comes from the Image table, same as Movie - see adminMoviesRepository.update's own comment)
    // so a manual edit here has to replace the Image row of that type, not just set the column.
    const { poster, backdrop, logo, ...rest } = dto;
    if (Object.keys(rest).length > 0) {
      await this.prisma.tVShow.update({
        where: { id },
        data: rest as Parameters<typeof this.prisma.tVShow.update>[0]['data'],
      });
    }

    const imageEdits: Array<{ type: 'POSTER' | 'BACKDROP' | 'LOGO'; url?: string }> = [
      { type: 'POSTER', url: poster },
      { type: 'BACKDROP', url: backdrop },
      { type: 'LOGO', url: logo },
    ];
    for (const edit of imageEdits) {
      if (!edit.url) continue;
      await this.prisma.image.deleteMany({ where: { showId: id, type: edit.type } });
      await this.prisma.image.create({
        data: { showId: id, type: edit.type, url: edit.url, provider: 'admin-manual' },
      });
    }
  }

  async addEpisodeStream(episodeId: string, dto: CreateStreamDto): Promise<void> {
    const episodeProviderId = await this.ensureEpisodeProvider(episodeId);
    await this.prisma.stream.create({
      data: {
        episodeProviderId,
        quality: dto.quality,
        serverName: dto.serverName ?? null,
        streamUrl: dto.streamUrl,
        language: dto.language ?? null,
        isDefault: dto.isDefault ?? false,
        isActive: true,
      },
    });
  }

  async addEpisodeSubtitle(episodeId: string, dto: CreateSubtitleDto): Promise<void> {
    const episodeProviderId = await this.ensureEpisodeProvider(episodeId);
    await this.prisma.subtitle.create({
      data: {
        episodeProviderId,
        language: dto.language,
        format: dto.format ?? 'vtt',
        url: dto.url,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async searchEpisodeSubtitles(episodeId: string, language: string): Promise<SubtitleCandidate[]> {
    const episode = await this.findEpisodeWithShow(episodeId);
    return this.openSubtitles.searchEpisode(
      episode.season.show.title,
      episode.season.show.imdbId,
      episode.season.seasonNumber,
      episode.episodeNumber,
      language,
    );
  }

  /** Same file-hash matching as AdminMoviesRepository.searchSubtitlesByHash, for one episode. */
  async searchEpisodeSubtitlesByHash(
    episodeId: string,
    language: string,
  ): Promise<SubtitleCandidate[]> {
    const stream = await this.prisma.stream.findFirst({
      where: { isActive: true, episodeProvider: { episodeId } },
      orderBy: { isDefault: 'desc' },
      select: { streamUrl: true },
    });
    if (!stream)
      throw new NotFoundException(`Episode "${episodeId}" has no active stream to hash.`);
    const hash = await this.movieHash.computeHash(stream.streamUrl);
    if (!hash) return [];
    return this.openSubtitles.searchByHash(hash, language);
  }

  /**
   * Attaches an OpenSubtitles search result to an episode without ever downloading/re-hosting
   * the file - same stable-resolve-URL indirection movie subtitles use (see
   * adminMoviesRepository.importSubtitle's own comment).
   */
  async importEpisodeSubtitle(episodeId: string, fileId: string, language: string): Promise<void> {
    const episodeProviderId = await this.ensureEpisodeProvider(
      episodeId,
      OPENSUBTITLES_PROVIDER_SLUG,
      'OpenSubtitles',
    );
    const created = await this.prisma.subtitle.create({
      data: { episodeProviderId, language, format: 'srt', url: '', externalFileId: fileId },
    });
    await this.prisma.subtitle.update({
      where: { id: created.id },
      data: { url: `${PUBLIC_API_BASE_URL}/subtitles/${created.id}/resolve` },
    });

    // See AdminMoviesRepository.importSubtitle's own comment - resolving right away is what
    // makes sync analysis possible here, and doubles as an early resolvedContent cache fill.
    const link = await this.openSubtitles.resolveDownloadLink(fileId);
    if (link) {
      const content = await fetchSubtitleTextSafely(link, language);
      // See AdminMoviesRepository.importSubtitle's own comment - a mismatched language/encoding
      // is left as "failed" rather than attached, so it never silently reaches viewers.
      if (content && isLikelyLanguageMatch(content, language)) {
        await this.prisma.subtitle.update({
          where: { id: created.id },
          data: { resolvedUrl: link, resolvedContent: content },
        });
        void this.triggerSyncAnalysis(episodeId, created.id, content);
        return;
      }
    }
    await this.prisma.subtitle.update({
      where: { id: created.id },
      data: { syncAnalysisStatus: 'failed' },
    });
  }

  /** Same locally-downloaded-file upload path as AdminMoviesRepository.uploadSubtitle, for one episode. */
  async uploadEpisodeSubtitle(
    episodeId: string,
    language: string,
    format: string,
    content: string,
  ): Promise<void> {
    if (!isLikelyLanguageMatch(content, language)) {
      throw new BadRequestException(
        `This file doesn't look like a "${language}" subtitle - check you picked the right file.`,
      );
    }
    const episodeProviderId = await this.ensureEpisodeProvider(episodeId);
    const created = await this.prisma.subtitle.create({
      data: { episodeProviderId, language, format, url: '', resolvedContent: content },
    });
    await this.prisma.subtitle.update({
      where: { id: created.id },
      data: { url: `${PUBLIC_API_BASE_URL}/subtitles/${created.id}/resolve` },
    });
    void this.triggerSyncAnalysis(episodeId, created.id, content);
  }

  private async findEpisodeWithShow(episodeId: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: { season: { include: { show: { select: { title: true, imdbId: true } } } } },
    });
    if (!episode) throw new NotFoundException(`Episode "${episodeId}" not found.`);
    return episode;
  }

  private async ensureEpisodeProvider(
    episodeId: string,
    providerSlug: string = MANUAL_PROVIDER_SLUG,
    providerName: string = 'Manual (Admin Panel)',
  ): Promise<string> {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true },
    });
    if (!episode) throw new NotFoundException(`Episode "${episodeId}" not found.`);

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

    const episodeProvider = await this.prisma.episodeProvider.upsert({
      where: { episodeId_providerId: { episodeId, providerId: provider.id } },
      create: { episodeId, providerId: provider.id },
      update: {},
    });
    return episodeProvider.id;
  }

  private toEpisodeSummary(seasonNumber: number, episode: EpisodeWithProviders) {
    const streams = episode.providers.flatMap((p) => p.streams);
    const subtitles = episode.providers.flatMap((p) => p.subtitles);
    return {
      id: episode.id,
      seasonNumber,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      stillImage: episode.stillImage,
      airDate: episode.airDate ? episode.airDate.toISOString() : null,
      hasPlayableStream: streams.some((s) => s.isActive),
      hasSubtitles: subtitles.length > 0,
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

  private toSummary(row: {
    id: string;
    title: string;
    titleAr: string | null;
    status: string;
    originalLanguage: string | null;
    rating: unknown;
    releaseDate: Date | null;
    numberOfSeasons: number;
    numberOfEpisodes: number;
    featuredOrder: number | null;
    images: Array<{ type: string; url: string }>;
    seasons: Array<{
      episodes: Array<{
        providers: Array<{ streams: Array<{ isActive: boolean }>; subtitles: Array<unknown> }>;
      }>;
    }>;
  }): AdminShowSummaryDto {
    const episodes = row.seasons.flatMap((season) => season.episodes);
    const hasIncompleteEpisodes = episodes.some((episode) => {
      const streams = episode.providers.flatMap((p) => p.streams);
      const subtitles = episode.providers.flatMap((p) => p.subtitles);
      return !streams.some((s) => s.isActive) || subtitles.length === 0;
    });
    return {
      id: row.id,
      title: row.title,
      titleAr: row.titleAr,
      status: row.status,
      originalLanguage: row.originalLanguage,
      poster: row.images.find((img) => img.type === 'POSTER')?.url ?? null,
      backdrop: row.images.find((img) => img.type === 'BACKDROP')?.url ?? null,
      logo: row.images.find((img) => img.type === 'LOGO')?.url ?? null,
      rating: row.rating === null ? null : Number(row.rating),
      releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
      numberOfSeasons: row.numberOfSeasons,
      numberOfEpisodes: row.numberOfEpisodes,
      featuredOrder: row.featuredOrder,
      hasIncompleteEpisodes,
    };
  }
}
