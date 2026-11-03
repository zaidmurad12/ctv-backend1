import { Controller, Get, Injectable, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/decorators.js';
import { PrismaService } from '../prisma/prismaService.js';
import type { FeaturedItemDto } from './dto.js';
import { MovieQueryRepository } from './infrastructure/movieQueryRepository.js';
import { ShowQueryRepository } from './infrastructure/showQueryRepository.js';
import { parseSectionRule, type SectionRule } from '../common/sectionRule.js';
import { PublicCache } from '../common/interceptors/publicCacheInterceptor.js';

export interface HomeSectionDto {
  id: string;
  kind: 'RECENT' | 'POPULAR' | 'TOP_RATED' | 'SERIES' | 'CUSTOM' | 'RULE';
  titleAr: string;
  titleEn: string;
  // null for the four built-in kinds - the app already computes those lists itself from the
  // catalog; only CUSTOM/RULE rows carry an explicit item list.
  items: FeaturedItemDto[] | null;
  // Whether this row's own maxItems cap is actually hiding more matches - the app's "View more"
  // card is offered only when this is true (for CUSTOM/RULE; the four built-in kinds are always
  // eligible client-side, since any real catalog has well over 20 of each). Without this, a rule
  // row capped at exactly its own maxItems (the common case) looked identical to one that
  // genuinely had no more, so "View more" never appeared even after an admin imported enough
  // titles to exceed it.
  hasMore: boolean;
}

@Injectable()
export class HomeSectionsUseCases {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly movies: MovieQueryRepository,
    private readonly shows: ShowQueryRepository,
  ) {}

  // Rule-driven rows (e.g. "newest Arabic movies") - straight from the live catalog, so a newly imported
  // title shows up in them without anyone touching the section. Always asks for one more than `limit` -
  // getting it back is the (cheap) way both this and the admin's own preview know there's more to offer
  // a "View more" screen for, without a separate count query.
  private async ruleItems(
    rule: SectionRule,
    limit: number,
    available = false,
  ): Promise<{ items: FeaturedItemDto[]; hasMore: boolean }> {
    const sort = rule.sort === 'newest' ? 'releaseDate' : rule.sort;
    // Only a rating sort needs a vote floor (a title with three votes shouldn't rank first) - and the floor
    // has to fit the catalog: Arabic/Turkish titles rarely have 50 votes on TMDB, which used to make the
    // row come back empty. Explicit minVotes always wins.
    const defaultFloor = rule.sort === 'rating' ? (rule.language ? 5 : 50) : undefined;
    const explicitFloor = rule.minVotes;
    const capLimit = limit + 1;
    const attempt = async (minVotes: number | undefined): Promise<FeaturedItemDto[]> => {
      // Newest excludes titles whose release date is still in the future (announced, not out yet).
      const fetchLimit = rule.sort === 'newest' ? capLimit * 2 : capLimit;
      const params = {
        sort,
        language: rule.language,
        genre: rule.genre,
        country: rule.country,
        person: rule.person,
        collection: rule.collection,
        yearFrom: rule.yearFrom,
        yearTo: rule.yearTo,
        minVotes,
        minRating: rule.minRating,
        limit: fetchLimit,
        page: 1,
        available,
      };
      const [movies, shows] = await Promise.all([
        rule.media === 'series' ? { items: [] } : this.movies.list(params),
        rule.media === 'movie' || rule.collection ? { items: [] } : this.shows.list(params),
      ]);
      let items: FeaturedItemDto[] = [
        ...movies.items.map((movie) => ({ ...movie, type: 'movie' as const })),
        ...shows.items.map((show) => ({ ...show, type: 'show' as const })),
      ];
      if (rule.sort === 'newest') {
        const now = Date.now();
        items = items.filter(
          (item) => !item.releaseDate || new Date(item.releaseDate).getTime() <= now,
        );
        items.sort(
          (a, b) => new Date(b.releaseDate ?? 0).getTime() - new Date(a.releaseDate ?? 0).getTime(),
        );
      } else if (rule.sort === 'rating') {
        items.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      }
      // (popularity: each list already comes back popularity-ordered; movies and shows simply follow one another)
      return items.slice(0, capLimit);
    };
    const first = await attempt(explicitFloor ?? defaultFloor);
    // A default floor that leaves nothing is dropped rather than showing an empty row.
    const raw =
      first.length === 0 && explicitFloor == null && defaultFloor != null
        ? await attempt(undefined)
        : first;
    return { items: raw.slice(0, limit), hasMore: raw.length > limit };
  }

  // For the admin's "what would this row show" preview - same computation the app gets.
  async previewRule(
    rule: SectionRule,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      type: 'movie' | 'show';
      title: string;
      year: number | null;
      rating: number | null;
    }>
  > {
    const { items } = await this.ruleItems(rule, limit);
    return items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.titleAr || item.title,
      year: item.releaseDate ? new Date(item.releaseDate).getUTCFullYear() : null,
      rating: item.rating ?? null,
    }));
  }

  // Shared by list() and fullItems() below - maps a CUSTOM section's stored, position-ordered items
  // (already fetched as part of the section row) to real movie/show summaries, capped at `limit`.
  private async customItems(
    storedItems: Array<{ movieId: string | null; showId: string | null }>,
    limit: number,
    available = false,
  ): Promise<FeaturedItemDto[]> {
    // With "available only", the whole hand-picked list is read and the first `limit` available
    // ones kept - the row stays full and keeps the admin's order.
    const wanted = available ? storedItems : storedItems.slice(0, limit);
    const [movies, shows] = await Promise.all([
      this.movies.byIds(wanted.flatMap((i) => (i.movieId ? [i.movieId] : []))),
      this.shows.byIds(wanted.flatMap((i) => (i.showId ? [i.showId] : []))),
    ]);
    const movieById = new Map(movies.map((m) => [m.id, m]));
    const showById = new Map(shows.map((s) => [s.id, s]));
    const items: FeaturedItemDto[] = [];
    for (const entry of wanted) {
      const movie = entry.movieId ? movieById.get(entry.movieId) : undefined;
      const show = entry.showId ? showById.get(entry.showId) : undefined;
      if (movie) items.push({ ...movie, type: 'movie' });
      else if (show) items.push({ ...show, type: 'show' });
    }
    if (!available) return items;
    return items
      .filter(
        (item) =>
          item.hasSourceMatch === true ||
          ('hasPlayableStream' in item && item.hasPlayableStream === true),
      )
      .slice(0, limit);
  }

  async list(available = false): Promise<HomeSectionDto[]> {
    const sections = await this.prismaService.client.homeSection.findMany({
      where: { isVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { orderBy: { position: 'asc' } } },
    });

    const result: HomeSectionDto[] = [];
    for (const section of sections) {
      if (section.kind === 'RULE') {
        const { items, hasMore } = await this.ruleItems(
          parseSectionRule(section.rule),
          section.maxItems,
          available,
        );
        result.push({
          id: section.id,
          kind: 'RULE',
          titleAr: section.titleAr,
          titleEn: section.titleEn,
          items,
          hasMore,
        });
        continue;
      }
      if (section.kind !== 'CUSTOM') {
        result.push({
          id: section.id,
          kind: section.kind,
          titleAr: section.titleAr,
          titleEn: section.titleEn,
          items: null,
          hasMore: false,
        });
        continue;
      }
      const items = await this.customItems(section.items, section.maxItems, available);
      result.push({
        id: section.id,
        kind: 'CUSTOM',
        titleAr: section.titleAr,
        titleEn: section.titleEn,
        items,
        hasMore: section.items.length > section.maxItems,
      });
    }
    return result;
  }

  // The app's "View more" screen - a section's fuller list, past whatever its own maxItems normally
  // caps the home row display at. Built-in kinds (RECENT/POPULAR/TOP_RATED/SERIES) return nothing
  // here - the app already knows how to fetch those itself directly from /movies and /shows.
  async fullItems(id: string, limit: number, available = false): Promise<FeaturedItemDto[]> {
    const section = await this.prismaService.client.homeSection.findFirst({
      where: { id, isVisible: true },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!section) return [];
    const cappedLimit = Math.min(100, Math.max(1, limit));
    if (section.kind === 'RULE') {
      const { items } = await this.ruleItems(
        parseSectionRule(section.rule),
        cappedLimit,
        available,
      );
      return items;
    }
    if (section.kind !== 'CUSTOM') return [];
    return this.customItems(section.items, cappedLimit, available);
  }
}

@ApiTags('home')
@Controller('home')
export class HomeSectionsController {
  constructor(private readonly useCases: HomeSectionsUseCases) {}

  @PublicCache()
  @Public()
  @Get('sections')
  @ApiOperation({ summary: 'Admin-managed home screen rows, in display order (visible ones only)' })
  sections(@Query('available') available?: string): Promise<HomeSectionDto[]> {
    return this.useCases.list(available === 'true');
  }

  @PublicCache()
  @Public()
  @Get('sections/:id/items')
  @ApiOperation({
    summary:
      "A home row's fuller item list, past its own display cap - powers the app's View more screen",
  })
  items(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('available') available?: string,
  ): Promise<FeaturedItemDto[]> {
    return this.useCases.fullItems(id, limit ? Number(limit) : 100, available === 'true');
  }
}
