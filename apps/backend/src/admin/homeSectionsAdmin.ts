import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, Matches, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Roles } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';
import { TmdbImportService } from './infrastructure/tmdbImportService.js';
import { HomeSectionsUseCases } from '../catalog/homeSections.js';
import { parseSectionRule } from '../common/sectionRule.js';
import { TmdbLookupService } from './infrastructure/tmdbLookupService.js';

const KINDS = ['RECENT', 'POPULAR', 'TOP_RATED', 'SERIES', 'CUSTOM', 'RULE'] as const;

// Ready-made TMDB lists. "Top rated" deliberately does NOT use TMDB's own /top_rated endpoint: it
// lets brand-new releases with a few hundred inflated votes (9.1/345) outrank the all-time greats,
// so it isn't an "all time" chart at all. A discover query sorted by rating with a real minimum
// vote count (5000 for movies, 1000 for shows) gives the list people actually expect - Shawshank,
// Godfather, Breaking Bad - and is deep enough for a Top 250.
const PRESETS: Record<string, { path: string; media: 'movie' | 'tv'; labelEn: string; params?: Record<string, string | number> }> = {
  'top-rated-movies': {
    path: '/discover/movie',
    media: 'movie',
    labelEn: 'Top rated movies of all time',
    params: { sort_by: 'vote_average.desc', 'vote_count.gte': 5000, include_adult: 'false' },
  },
  'popular-movies': { path: '/movie/popular', media: 'movie', labelEn: 'Popular movies' },
  'now-playing-movies': { path: '/movie/now_playing', media: 'movie', labelEn: 'Now playing in theaters' },
  'upcoming-movies': { path: '/movie/upcoming', media: 'movie', labelEn: 'Upcoming movies' },
  'trending-movies-week': { path: '/trending/movie/week', media: 'movie', labelEn: 'Trending movies this week' },
  'top-rated-tv': {
    path: '/discover/tv',
    media: 'tv',
    labelEn: 'Top rated TV shows of all time',
    params: { sort_by: 'vote_average.desc', 'vote_count.gte': 1000, include_adult: 'false' },
  },
  'popular-tv': { path: '/tv/popular', media: 'tv', labelEn: 'Popular TV shows' },
  'on-the-air-tv': { path: '/tv/on_the_air', media: 'tv', labelEn: 'TV shows on the air' },
  'trending-tv-week': { path: '/trending/tv/week', media: 'tv', labelEn: 'Trending TV shows this week' },
};

export class SectionRuleDto {
  @IsIn(['movie', 'series', 'all'])
  media!: 'movie' | 'series' | 'all';

  @IsIn(['newest', 'rating', 'popularity'])
  sort!: 'newest' | 'rating' | 'popularity';

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minVotes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  minRating?: number;
}

export class CreateHomeSectionDto {
  // Only for kind RULE.
  @IsOptional()
  @ValidateNested()
  @Type(() => SectionRuleDto)
  rule?: SectionRuleDto;

  @IsIn(KINDS as unknown as string[])
  kind!: (typeof KINDS)[number];

  @IsString()
  @MinLength(1)
  titleAr!: string;

  @IsString()
  @MinLength(1)
  titleEn!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxItems?: number;
}

export class UpdateHomeSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  titleAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  titleEn?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxItems?: number;
}

export class ReorderHomeSectionsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class AddHomeSectionItemDto {
  @IsOptional()
  @IsString()
  movieId?: string;

  @IsOptional()
  @IsString()
  showId?: string;
}

export class ImportHomeSectionDto {
  @IsIn(['preset', 'list', 'discover', 'imdb'])
  source!: 'preset' | 'list' | 'discover' | 'imdb';

  // For source "imdb": the tt-ids of an IMDb list, in list order (IMDb blocks server-side fetching of
  // list pages, so the admin exports the list in their browser and pastes/uploads it - see the UI).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^tt\d{6,10}$/, { each: true })
  imdbIds?: string[];

  @IsOptional()
  @IsString()
  preset?: string;

  // A TMDB list id, or the full themoviedb.org/list/<id> URL - the digits are pulled out either way.
  @IsOptional()
  @IsString()
  listId?: string;

  @IsOptional()
  @IsIn(['movie', 'tv'])
  kind?: 'movie' | 'tv';

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  language?: string;

  // Comma-separated TMDB genre / keyword ids (e.g. "18,35").
  @IsOptional()
  @IsString()
  genres?: string;

  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minVotes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  minRating?: number;

  @IsOptional()
  @IsIn(['popularity.desc', 'vote_average.desc', 'primary_release_date.desc', 'first_air_date.desc'])
  sortBy?: string;

  @IsInt()
  @Min(1)
  @Max(500)
  limit!: number;

  @IsOptional()
  @IsBoolean()
  importMissing?: boolean;
}

interface CollectedItem {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
}

@Injectable()
export class HomeSectionsAdminService {
  private readonly logger = new Logger(HomeSectionsAdminService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly tmdbLookup: TmdbLookupService,
    private readonly tmdbImport: TmdbImportService,
    private readonly homeSections: HomeSectionsUseCases,
  ) {}

  private get db() {
    return this.prismaService.client;
  }

  async list() {
    const sections = await this.db.homeSection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
    return sections.map(({ _count, ...section }) => ({ ...section, itemCount: _count.items }));
  }

  previewRule(rule: SectionRuleDto, limit: number) {
    return this.homeSections.previewRule(parseSectionRule(rule), Math.min(100, Math.max(1, limit)));
  }

  async create(dto: CreateHomeSectionDto) {
    const last = await this.db.homeSection.aggregate({ _max: { sortOrder: true } });
    return this.db.homeSection.create({
      data: {
        kind: dto.kind,
        titleAr: dto.titleAr,
        titleEn: dto.titleEn,
        maxItems: dto.maxItems ?? 20,
        ...(dto.kind === 'RULE' && dto.rule
          ? { rule: { media: dto.rule.media, sort: dto.rule.sort, language: dto.rule.language, genre: dto.rule.genre, minVotes: dto.rule.minVotes, minRating: dto.rule.minRating } }
          : {}),
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(id: string, dto: UpdateHomeSectionDto): Promise<void> {
    await this.mustExist(id);
    await this.db.homeSection.update({ where: { id }, data: dto });
  }

  async reorder(ids: string[]): Promise<void> {
    await this.db.$transaction(ids.map((id, index) => this.db.homeSection.update({ where: { id }, data: { sortOrder: index } })));
  }

  async remove(id: string): Promise<void> {
    await this.mustExist(id);
    await this.db.homeSection.delete({ where: { id } });
  }

  async items(id: string) {
    await this.mustExist(id);
    const rows = await this.db.homeSectionItem.findMany({
      where: { sectionId: id },
      orderBy: { position: 'asc' },
      include: {
        movie: { select: { id: true, title: true, titleAr: true, releaseDate: true, rating: true, status: true } },
        show: { select: { id: true, title: true, titleAr: true, releaseDate: true, rating: true, status: true } },
      },
    });
    return rows.map((row) => {
      const target = row.movie ?? row.show;
      return {
        itemId: row.id,
        type: row.movie ? ('movie' as const) : ('show' as const),
        id: target?.id ?? '',
        title: target?.titleAr || target?.title || '',
        year: target?.releaseDate ? target.releaseDate.getUTCFullYear() : null,
        rating: target?.rating != null ? Number(target.rating) : null,
        status: target?.status ?? null,
      };
    });
  }

  async addItem(id: string, dto: AddHomeSectionItemDto): Promise<void> {
    await this.mustExist(id);
    if (!dto.movieId && !dto.showId) throw new BadRequestException('movieId or showId is required.');
    const last = await this.db.homeSectionItem.aggregate({ where: { sectionId: id }, _max: { position: true } });
    await this.db.homeSectionItem.create({
      data: { sectionId: id, movieId: dto.movieId ?? null, showId: dto.showId ?? null, position: (last._max.position ?? -1) + 1 },
    });
  }

  async removeItem(id: string, itemId: string): Promise<void> {
    await this.db.homeSectionItem.deleteMany({ where: { id: itemId, sectionId: id } });
  }

  // Kicks off the import and returns immediately - filling a 250-title row means importing every
  // title not already in the catalog (seconds each), far longer than one HTTP request. Progress is
  // written onto the section row (importStatus/importDone/importTotal) for the admin page to poll.
  // The admin page polling is also what keeps the Cloud Run instance busy enough to finish; if it
  // is ever cut short, "import" can simply be run again - titles already imported are skipped.
  async startImport(id: string, dto: ImportHomeSectionDto): Promise<void> {
    const section = await this.mustExist(id);
    if (section.kind !== 'CUSTOM') throw new BadRequestException('Only custom sections can be filled from TMDB.');
    if (this.running.has(id)) throw new BadRequestException('An import is already running for this section.');
    const plan = this.buildPlan(dto);

    this.running.add(id);
    await this.db.homeSection.update({
      where: { id },
      data: { importSource: plan.description, importStatus: 'IMPORTING', importTotal: 0, importDone: 0, importError: null },
    });
    void this.runImport(id, dto, plan)
      .catch(async (err) => {
        this.logger.error(`Home section import failed: ${err instanceof Error ? err.message : String(err)}`);
        await this.db.homeSection
          .update({ where: { id }, data: { importStatus: 'FAILED', importError: String(err instanceof Error ? err.message : err).slice(0, 900) } })
          .catch(() => undefined);
      })
      .finally(() => this.running.delete(id));
  }

  // Paste-a-link preview: everything a TMDB list holds (first `maxItems` of it), each flagged with
  // whether it is already in our catalog. Nothing is imported here.
  async previewTmdbList(rawListId: string, maxItems = 120) {
    const listId = rawListId.match(/\d+/)?.[0];
    if (!listId) throw new BadRequestException('A TMDB list id (or list URL) is required.');
    const collected: Array<{ tmdbId: string; mediaType: 'movie' | 'tv'; title: string; year: number | null; poster: string | null }> = [];
    let meta: { name: string | null; description: string | null; itemCount: number | null } = { name: null, description: null, itemCount: null };
    for (let page = 1; collected.length < maxItems && page <= 20; page++) {
      const result = await this.tmdbLookup.previewList(listId, page);
      if (page === 1) meta = { name: result.name, description: result.description, itemCount: result.itemCount };
      collected.push(...result.items);
      if (page >= result.totalPages || result.items.length === 0) break;
    }
    const items = collected.slice(0, maxItems);
    const movieIds = items.filter((i) => i.mediaType === 'movie').map((i) => i.tmdbId);
    const showIds = items.filter((i) => i.mediaType === 'tv').map((i) => i.tmdbId);
    const [movies, shows] = await Promise.all([
      this.db.movie.findMany({ where: { tmdbId: { in: movieIds }, deletedAt: null }, select: { tmdbId: true } }),
      this.db.tVShow.findMany({ where: { tmdbId: { in: showIds }, deletedAt: null }, select: { tmdbId: true } }),
    ]);
    const have = new Set([...movies, ...shows].map((row) => row.tmdbId));
    return {
      listId,
      name: meta.name,
      description: meta.description,
      total: meta.itemCount ?? collected.length,
      items: items.map((item) => ({ ...item, inCatalog: have.has(item.tmdbId) })),
    };
  }

  private buildPlan(dto: ImportHomeSectionDto): {
    path: string;
    media: 'movie' | 'tv';
    params: Record<string, string | number>;
    description: string;
  } {
    if (dto.source === 'imdb') {
      if (!dto.imdbIds?.length) throw new BadRequestException('No IMDb ids were provided.');
      return { path: '', media: 'movie', params: {}, description: `IMDb list (${dto.imdbIds.length} titles)` };
    }
    if (dto.source === 'preset') {
      const preset = dto.preset ? PRESETS[dto.preset] : undefined;
      if (!preset) throw new BadRequestException('Unknown preset.');
      return { path: preset.path, media: preset.media, params: { language: 'en-US', ...preset.params }, description: preset.labelEn };
    }
    if (dto.source === 'list') {
      const digits = (dto.listId ?? '').match(/\d+/)?.[0];
      if (!digits) throw new BadRequestException('A TMDB list id (or list URL) is required.');
      return { path: `/list/${digits}`, media: 'movie', params: { language: 'en-US' }, description: `TMDB list ${digits}` };
    }
    const media = dto.kind ?? 'movie';
    const params: Record<string, string | number> = {
      language: 'en-US',
      include_adult: 'false',
      sort_by: dto.sortBy ?? 'popularity.desc',
    };
    if (dto.year) params[media === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = dto.year;
    if (dto.language) params.with_original_language = dto.language;
    if (dto.genres) params.with_genres = dto.genres;
    if (dto.keywords) params.with_keywords = dto.keywords;
    if (dto.minVotes != null) params['vote_count.gte'] = dto.minVotes;
    if (dto.minRating != null) params['vote_average.gte'] = dto.minRating;
    return { path: `/discover/${media}`, media, params, description: `TMDB discover (${media})` };
  }

  private async runImport(
    id: string,
    dto: ImportHomeSectionDto,
    plan: { path: string; media: 'movie' | 'tv'; params: Record<string, string | number> },
  ): Promise<void> {
    const collected: CollectedItem[] = [];
    const seen = new Set<string>();
    if (dto.source === 'imdb') collected.push(...(await this.resolveImdbIds(dto.imdbIds ?? [])));
    for (let page = 1; dto.source !== 'imdb' &&  collected.length < dto.limit && page <= 500; page++) {
      const result = await this.tmdbLookup.fetchPage(plan.path, { ...plan.params, page }, plan.media);
      for (const item of result.items) {
        const key = `${item.mediaType}:${item.tmdbId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(item);
      }
      if (page >= result.totalPages || result.items.length === 0) break;
    }
    const wanted = collected.slice(0, dto.limit);
    await this.db.homeSectionItem.deleteMany({ where: { sectionId: id } });
    await this.db.homeSection.update({
      where: { id },
      data: { importTotal: wanted.length, maxItems: Math.min(100, Math.max(wanted.length, 1)) },
    });

    const importMissing = dto.importMissing !== false;
    let done = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < wanted.length) {
        const index = cursor++;
        const item = wanted[index]!;
        try {
          const internalId = await this.resolveInternalId(item, importMissing);
          if (internalId) {
            await this.db.homeSectionItem.create({
              data: {
                sectionId: id,
                position: index,
                movieId: item.mediaType === 'movie' ? internalId : null,
                showId: item.mediaType === 'tv' ? internalId : null,
              },
            });
          }
        } catch (err) {
          this.logger.warn(`Home section item ${item.mediaType} ${item.tmdbId} skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
        done += 1;
        await this.db.homeSection.update({ where: { id }, data: { importDone: done } });
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    await this.db.homeSection.update({ where: { id }, data: { importStatus: 'DONE' } });
  }

  // Each IMDb id -> its TMDB movie or show (TMDB's own /find), in the list's order; an id TMDB doesn't know is skipped.
  private async resolveImdbIds(ids: string[]): Promise<CollectedItem[]> {
    const results: Array<CollectedItem | null> = new Array(ids.length).fill(null);
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) {
        const index = cursor++;
        try {
          const found = await this.tmdbLookup.findByImdb(ids[index]!);
          const movie = found.movieResults[0];
          const show = found.tvResults[0];
          if (movie) results[index] = { tmdbId: String(movie.id), mediaType: 'movie' };
          else if (show) results[index] = { tmdbId: String(show.id), mediaType: 'tv' };
        } catch (err) {
          this.logger.warn(`IMDb id ${ids[index]} could not be resolved: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    return results.filter((item): item is CollectedItem => item !== null);
  }

  private async resolveInternalId(item: CollectedItem, importMissing: boolean): Promise<string | null> {
    if (item.mediaType === 'movie') {
      const existing = await this.db.movie.findFirst({ where: { tmdbId: item.tmdbId, deletedAt: null }, select: { id: true } });
      if (existing) return existing.id;
      return importMissing ? this.tmdbImport.importMovie(item.tmdbId) : null;
    }
    const existing = await this.db.tVShow.findFirst({ where: { tmdbId: item.tmdbId, deletedAt: null }, select: { id: true } });
    if (existing) return existing.id;
    return importMissing ? this.tmdbImport.importShow(item.tmdbId) : null;
  }

  private async mustExist(id: string) {
    const section = await this.db.homeSection.findUnique({ where: { id } });
    if (!section) throw new NotFoundException(`Home section "${id}" not found.`);
    return section;
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/home-sections')
export class HomeSectionsAdminController {
  constructor(private readonly service: HomeSectionsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Every home screen row, in display order' })
  list() {
    return this.service.list();
  }

  @Get('presets')
  @ApiOperation({ summary: 'Ready-made TMDB lists that can fill a row' })
  presets() {
    return Object.entries(PRESETS).map(([key, value]) => ({ key, labelEn: value.labelEn, media: value.media }));
  }

  @Get('tmdb-list')
  @ApiOperation({ summary: 'Preview everything inside a TMDB list (paste its link or id) before importing it' })
  tmdbListPreview(@Query('listId') listId: string) {
    return this.service.previewTmdbList(listId ?? '');
  }

  @Post('rule-preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'What a rule-based row would show right now' })
  rulePreview(@Body() body: { rule: SectionRuleDto; limit?: number }) {
    return this.service.previewRule(body.rule, body.limit ?? 20);
  }

  @Post()
  create(@Body() dto: CreateHomeSectionDto) {
    return this.service.create(dto);
  }

  @Put('order')
  @HttpCode(204)
  reorder(@Body() dto: ReorderHomeSectionsDto): Promise<void> {
    return this.service.reorder(dto.ids);
  }

  @Patch(':id')
  @HttpCode(204)
  update(@Param('id') id: string, @Body() dto: UpdateHomeSectionDto): Promise<void> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }

  @Get(':id/items')
  items(@Param('id') id: string) {
    return this.service.items(id);
  }

  @Post(':id/items')
  @HttpCode(204)
  addItem(@Param('id') id: string, @Body() dto: AddHomeSectionItemDto): Promise<void> {
    return this.service.addItem(id, dto);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(204)
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string): Promise<void> {
    return this.service.removeItem(id, itemId);
  }

  @Post(':id/import')
  @HttpCode(202)
  @ApiOperation({ summary: 'Fill a custom row from a TMDB preset/list/discover query (runs in the background)' })
  import(@Param('id') id: string, @Body() dto: ImportHomeSectionDto): Promise<void> {
    return this.service.startImport(id, dto);
  }
}
